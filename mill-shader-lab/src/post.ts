import { Vector2, type Matrix4, type PerspectiveCamera, type Texture, type WebGLRenderTarget } from "three";
import type { SceneAssets } from "./assets";
import type { Effects } from "./effects";
import { GPU, u } from "./gpu";
import type { LabState } from "./state";
import atmosphere from "./shaders/atmosphere.frag?raw";
import edges from "./shaders/edges.frag?raw";
import filters from "./shaders/image-filter.frag?raw";
import focus from "./shaders/focus.frag?raw";
import motion from "./shaders/motion.frag?raw";
import bloom from "./shaders/bloom.frag?raw";
import color from "./shaders/color-effects.frag?raw";

export const postBuffers = {
  "Fog amount": ["Atmosphere", "Scene color", "Opacity of the native-style near/far ramp or exponential fog."],
  "Smoke mask": ["Smoke sprites", "Atmosphere", "Opacity of live, depth-tested smoke sampled from the original sprite."],
  "Outline edges": ["Outline detection", "Scene color", "Position differences or depth and normal discontinuities."],
  "Focus / blur mask": ["Depth of field", "Focus composite", "Black stays sharp. White uses the blurred source."],
  "Blurred source": ["Gaussian blur", "Depth of field", "Blurred scene before dilation; watch foreground color bleed over a depth edge."],
  "Dilated source": ["Depth-guided dilation", "Gaussian blur", "Far colors extended under foreground edges before blurring."],
  "Dilated blur": ["Gaussian blur of dilated source", "Depth of field", "Compare this with Blurred source at a near silhouette."],
  "Depth of field": ["Focus composite", "Post processing", "Sharp and blurred inputs mixed by the focus mask."],
  "Motion direction": ["Camera reprojection", "Motion blur", "Neutral red/green means still. Offsets encode signed UV motion from the previous camera."],
  "Motion blur": ["Camera reprojection sampling", "Post processing", "Samples along the current-to-previous pixel direction. No object velocity is stored."],
  "Filtered color": ["Spatial filter", "Color effects", "Box, separable Gaussian or low-variance Kuwahara sampling."],
  "Bloom extraction": ["Threshold / bright-pass", "Bloom blur or add", "Legacy averages thresholded neighbors. HDR stores the excess above linear white at half resolution."],
  "Bloom blur": ["Half-resolution Gaussian blur", "Bloom add", "HDR highlight energy spread in horizontal and vertical passes."],
  "Bloom combined": ["Bloom add", "Tone mapping", "Linear scene radiance plus the bloom layer."],
  "Display linear": ["Tone and image effects", "LUT / split toning", "Display-range linear RGB before grading and output encoding."],
  "Graded linear": ["LUT / split toning", "Output encoding", "Linear result of the grade. The LUT pass decodes the table result back to linear."],
} as const;
export type PostBuffer = keyof typeof postBuffers;

export function isPostBuffer(name: string): name is PostBuffer {
  return Object.hasOwn(postBuffers, name);
}

type View = { target: WebGLRenderTarget; fragment: string; slot?: number; style?: number };
const horizontal = new Vector2(1, 0), vertical = new Vector2(0, 1);

export class Post {
  private readonly atmosphere;
  private readonly edge;
  private readonly filter;
  private readonly focus;
  private readonly motion;
  private readonly bloom;
  private readonly color;
  private readonly atmosTarget;
  private readonly edgeTarget;
  private readonly filterTarget;
  private readonly dilated;
  private readonly blurred;
  private readonly dilatedBlur;
  private readonly focusTarget;
  private readonly motionTarget;
  private readonly bright;
  private readonly legacyBright;
  private readonly bloomBlur;
  private readonly combined;
  private readonly colorTarget;
  private readonly scratch;
  private readonly halfScratch;
  private readonly focusUV = new Vector2();
  private readonly views: Record<PostBuffer, View>;

  constructor(
    private readonly gpu: GPU, camera: PerspectiveCamera, assets: SceneAssets,
    opaqueDepth: Texture, waterDepth: Texture, opaqueNormal: Texture, waterNormal: Texture,
    previousViewProjection: Matrix4,
  ) {
    const target = (name: string, count = 1, scale = 1, floating = true) => gpu.target(name, { count, scale, floating });
    this.atmosTarget = target("Atmosphere", 3);
    this.edgeTarget = target("Outline", 2);
    this.filterTarget = target("Image filter");
    this.dilated = target("Dilated focus source");
    this.blurred = target("Blurred focus source");
    this.dilatedBlur = target("Blurred dilated source");
    this.focusTarget = target("Focus result", 2);
    this.motionTarget = target("Camera motion", 2);
    this.bright = target("HDR bright-pass", 1, 0.5);
    this.legacyBright = target("Legacy bloom filter");
    this.bloomBlur = target("HDR blur", 1, 0.5);
    this.combined = target("Bloom add");
    this.colorTarget = target("Color stages", 2);
    this.scratch = target("Blur scratch");
    this.halfScratch = target("HDR blur scratch", 1, 0.5);
    const depth = {
      opaqueDepth: u(opaqueDepth), waterDepth: u(waterDepth),
      projection: u(camera.projectionMatrix), inverseProjection: u(camera.projectionMatrixInverse),
    };
    this.atmosphere = gpu.pass(atmosphere, {
      ...depth, inputColor: u(null), smokeMap: u(assets.textures.smoke), viewMatrix: u(camera.matrixWorldInverse),
      daylight: u(1), fogMode: u(0), fogNear: u(2), fogFar: u(9), fogDensity: u(0.18), smoke: u(false), time: u(0),
    });
    this.edge = gpu.pass(edges, {
      ...depth, inputColor: u(null), opaqueNormal: u(opaqueNormal), waterNormal: u(waterNormal), mode: u(0), threshold: u(0.22),
    });
    this.filter = gpu.pass(filters, { inputColor: u(null), axis: u(horizontal), mode: u(2), radius: u(1) });
    this.focus = gpu.pass(focus, {
      ...depth, inputColor: u(null), blurred: u(null), focusUV: u(this.focusUV), aperture: u(1),
      focusFallback: u(1), mode: u(0),
    });
    this.motion = gpu.pass(motion, {
      ...depth, inputColor: u(null), inverseView: u(camera.matrixWorld), previousViewProjection: u(previousViewProjection), strength: u(0),
    });
    this.bloom = gpu.pass(bloom, { ...depth, inputColor: u(null), bloomTexture: u(null), mode: u(0), strength: u(0.7) });
    this.color = gpu.pass(color, {
      ...depth, inputColor: u(null), neutralLut: u(assets.textures.neutralLut), dayLut: u(assets.textures.dayLut), nightLut: u(assets.textures.nightLut),
      daylight: u(1), toneMap: u(false), grayRamp: u(false), levels: u(0), posterStyle: u(0), blockSize: u(0), pixelBackground: u(true),
      sharpness: u(0), grainAmount: u(0), frame: u(0), grade: u(0),
    });
    this.views = {
      "Fog amount": { target: this.atmosTarget, fragment: atmosphere, slot: 1, style: 1 },
      "Smoke mask": { target: this.atmosTarget, fragment: atmosphere, slot: 2, style: 1 },
      "Outline edges": { target: this.edgeTarget, fragment: edges, slot: 1, style: 1 },
      "Focus / blur mask": { target: this.focusTarget, fragment: focus, slot: 1, style: 1 },
      "Blurred source": { target: this.blurred, fragment: filters },
      "Dilated source": { target: this.dilated, fragment: focus },
      "Dilated blur": { target: this.dilatedBlur, fragment: filters },
      "Depth of field": { target: this.focusTarget, fragment: focus },
      "Motion direction": { target: this.motionTarget, fragment: motion, slot: 1, style: 1 },
      "Motion blur": { target: this.motionTarget, fragment: motion },
      "Filtered color": { target: this.filterTarget, fragment: filters },
      "Bloom extraction": { target: this.bright, fragment: bloom },
      "Bloom blur": { target: this.bloomBlur, fragment: filters },
      "Bloom combined": { target: this.combined, fragment: bloom },
      "Display linear": { target: this.colorTarget, fragment: color, slot: 1, style: 1 },
      "Graded linear": { target: this.colorTarget, fragment: color, style: 1 },
    };
  }

  view(name: PostBuffer, fx: Effects) {
    const view = this.views[name];
    const target = name === "Bloom extraction" && (fx.bloom !== 2 || !this.gpu.hdr)
      ? this.legacyBright : view.target;
    return { texture: target.textures[view.slot ?? 0]!, style: view.style ?? 0, fragment: view.fragment };
  }

  private imageFilter(input: Texture, target: WebGLRenderTarget, radius: number, mode: number, axis = horizontal) {
    const f = this.filter.uniforms;
    f.inputColor!.value = input;
    f.mode!.value = mode;
    f.radius!.value = radius;
    f.axis!.value = axis;
    this.gpu.draw(this.filter, target);
  }

  private gaussian(input: Texture, output: WebGLRenderTarget, radius: number, half = false) {
    const scratch = half ? this.halfScratch : this.scratch;
    this.imageFilter(input, scratch, radius, 2, horizontal);
    this.imageFilter(scratch.texture, output, radius, 2, vertical);
  }

  render(input: Texture, fx: Effects, state: LabState, daylight: number, view: string) {
    const gpu = this.gpu;
    this.focusUV.fromArray(state.focus);
    if (fx.fog || fx.smoke || view === "Fog amount" || view === "Smoke mask") {
      const a = this.atmosphere.uniforms;
      a.inputColor!.value = input;
      a.daylight!.value = daylight;
      a.fogMode!.value = fx.fog;
      a.fogNear!.value = fx.fogNear;
      a.fogFar!.value = fx.fogFar;
      a.fogDensity!.value = fx.density;
      a.smoke!.value = !!fx.smoke;
      a.time!.value = state.time;
      gpu.draw(this.atmosphere, this.atmosTarget);
      input = this.atmosTarget.texture;
    }
    if (fx.outline || view === "Outline edges") {
      const e = this.edge.uniforms;
      e.inputColor!.value = input;
      e.mode!.value = fx.outline;
      e.threshold!.value = fx.outlineThreshold;
      gpu.draw(this.edge, this.edgeTarget);
      if (fx.outline) input = this.edgeTarget.texture;
    }
    if (fx.dof || ["Focus / blur mask", "Blurred source", "Dilated source", "Dilated blur", "Depth of field"].includes(view)) {
      const f = this.focus.uniforms;
      f.inputColor!.value = input;
      f.aperture!.value = fx.aperture;
      f.focusFallback!.value = state.orbit.radius;
      if (fx.dilation || view === "Dilated source" || view === "Dilated blur") {
        f.mode!.value = 0;
        f.blurred!.value = input;
        gpu.draw(this.focus, this.dilated);
        this.gaussian(this.dilated.texture, this.dilatedBlur, 1.6);
      }
      if (!fx.dilation || view === "Blurred source") this.gaussian(input, this.blurred, 1.6);
      f.mode!.value = 1;
      f.blurred!.value = fx.dilation ? this.dilatedBlur.texture : this.blurred.texture;
      gpu.draw(this.focus, this.focusTarget);
      if (fx.dof) input = this.focusTarget.texture;
    }
    if (fx.motion || view === "Motion direction" || view === "Motion blur") {
      this.motion.uniforms.inputColor!.value = input;
      this.motion.uniforms.strength!.value = fx.motion && state.sweepFrame !== null ? fx.motionStrength : 0;
      gpu.draw(this.motion, this.motionTarget);
      if (fx.motion) input = this.motionTarget.texture;
    }
    if (fx.filter || view === "Filtered color") {
      if (fx.filter === 2) this.gaussian(input, this.filterTarget, fx.blurSize);
      else this.imageFilter(input, this.filterTarget, fx.blurSize, fx.filter);
      if (fx.filter) input = this.filterTarget.texture;
    }
    const hdrBloom = fx.bloom === 2 && gpu.hdr;
    if (fx.bloom || view.startsWith("Bloom")) {
      const b = this.bloom.uniforms;
      b.inputColor!.value = input;
      b.bloomTexture!.value = input;
      b.mode!.value = hdrBloom ? 0 : 1;
      const extracted = hdrBloom ? this.bright : this.legacyBright;
      gpu.draw(this.bloom, extracted);
      if (hdrBloom || view === "Bloom blur") this.gaussian(extracted.texture, this.bloomBlur, 1, true);
      b.mode!.value = 2;
      b.strength!.value = fx.bloomStrength;
      b.bloomTexture!.value = hdrBloom ? this.bloomBlur.texture : extracted.texture;
      gpu.draw(this.bloom, this.combined);
      if (fx.bloom === 1 || hdrBloom) input = this.combined.texture;
    }
    const c = this.color.uniforms;
    c.inputColor!.value = input;
    c.daylight!.value = daylight;
    c.toneMap!.value = hdrBloom;
    c.grayRamp!.value = !!fx.grayRamp;
    c.levels!.value = fx.poster ? fx.levels : 0;
    c.posterStyle!.value = fx.posterStyle;
    c.blockSize!.value = fx.pixel ? fx.blockSize : 0;
    c.pixelBackground!.value = !!fx.pixelBackground;
    c.sharpness!.value = fx.sharpen ? fx.sharpness : 0;
    c.grainAmount!.value = fx.grain ? fx.grainAmount : 0;
    c.frame!.value = state.frame;
    c.grade!.value = fx.grade;
    gpu.draw(this.color, this.colorTarget);
    return this.colorTarget.texture;
  }
}
