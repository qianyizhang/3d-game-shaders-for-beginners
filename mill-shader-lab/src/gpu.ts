import {
  BufferAttribute, BufferGeometry, Camera, DepthTexture, GLSL3, HalfFloatType, Mesh, NearestFilter,
  RawShaderMaterial, Scene, UnsignedByteType, UnsignedIntType, WebGLRenderer, WebGLRenderTarget,
  type ShaderMaterialParameters,
} from "three";
import quadVert from "./shaders/screen.vert?raw";
import depth from "./shaders/depth.glsl?raw";
import color from "./shaders/color.glsl?raw";
import lighting from "./shaders/lighting.glsl?raw";
import surface from "./shaders/surface.glsl?raw";

export type Uniforms = NonNullable<ShaderMaterialParameters["uniforms"]>;
export const u = <T>(value: T) => ({ value });
export function source(glsl: string) {
  return glsl.replace("#include <lab_depth>", depth).replace("#include <lab_surface>", surface).replace("#include <lab_lighting>", lighting).replace("#include <lab_color>", color);
}
export function material(vertex: string, fragment: string, uniforms: Uniforms, extra?: ShaderMaterialParameters) {
  return new RawShaderMaterial({
    glslVersion: GLSL3, vertexShader: vertex, fragmentShader: source(fragment), uniforms, ...extra,
  });
}

export class GPU {
  readonly gl: WebGL2RenderingContext;
  readonly renderer: WebGLRenderer;
  readonly hdr: boolean;
  private readonly screen = new Scene();
  private readonly camera = new Camera();
  private readonly triangle: Mesh;
  readonly targets = new Map<WebGLRenderTarget, number>();
  width = 1;
  height = 1;

  constructor(canvas: HTMLCanvasElement, mode: string | null) {
    const gl = mode === "none" ? null : canvas.getContext("webgl2", {
      antialias: false, alpha: false, powerPreference: "high-performance",
    });
    if (!gl || gl.getParameter(gl.MAX_DRAW_BUFFERS) < 4) throw new Error("WebGL 2 with four draw buffers is required for live exercises.");
    this.gl = gl;
    this.hdr = mode !== "sdr" && this.testFloatTarget();
    this.renderer = new WebGLRenderer({ canvas, context: gl });
    this.renderer.debug.onShaderError = (ctx, program, vert, frag) => {
      throw new Error([ctx.getShaderInfoLog(vert), ctx.getShaderInfoLog(frag), ctx.getProgramInfoLog(program)].filter(Boolean).join("\n"));
    };
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    this.triangle = new Mesh(geometry);
    this.triangle.frustumCulled = false;
    this.screen.add(this.triangle);
  }

  private testFloatTarget() {
    const gl = this.gl;
    if (!gl.getExtension("EXT_color_buffer_float")) return false;
    const framebuffer = gl.createFramebuffer();
    const tex = gl.createTexture();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA16F, 1, 1);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteTexture(tex);
    gl.deleteFramebuffer(framebuffer);
    return ok;
  }

  target(name: string, { scale = 1, count = 1, depth = false, floating = false } = {}) {
    const target = new WebGLRenderTarget(1, 1, {
      count, minFilter: NearestFilter, magFilter: NearestFilter,
      depthBuffer: depth, depthTexture: depth ? new DepthTexture(1, 1, UnsignedIntType) : null,
      type: floating && this.hdr ? HalfFloatType : UnsignedByteType,
      generateMipmaps: false,
    });
    for (const [i, texture] of target.textures.entries()) texture.name = `${name} · ${i}`;
    this.targets.set(target, scale);
    return target;
  }

  resize(width: number, height: number) {
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height, false);
    for (const [target, scale] of this.targets) target.setSize(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)));
  }

  pass(fragment: string, uniforms: Uniforms) {
    return material(quadVert, fragment, uniforms, { depthTest: false, depthWrite: false });
  }

  draw(pass: RawShaderMaterial, target: WebGLRenderTarget | null) {
    this.triangle.material = pass;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.screen, this.camera);
  }

  validate(fragment: string) {
    const gl = this.gl;
    const program = gl.createProgram();
    if (!program) throw new Error("Could not allocate shader program");
    const shaders: WebGLShader[] = [];
    try {
      for (const [type, code] of [[gl.VERTEX_SHADER, quadVert], [gl.FRAGMENT_SHADER, source(fragment)]] as const) {
        const shader = gl.createShader(type);
        if (!shader) throw new Error("Could not allocate shader");
        shaders.push(shader);
        gl.shaderSource(shader, "#version 300 es\n" + code);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? "Shader compilation failed");
        gl.attachShader(program, shader);
      }
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? "Shader link failed");
    } finally {
      gl.deleteProgram(program);
      for (const shader of shaders) gl.deleteShader(shader);
    }
  }
}
