import type { RawShaderMaterial, Texture, WebGLRenderTarget } from "three";
import type { Effects } from "./effects";
import { source } from "./gpu";
import vertex from "./shaders/geometry.vert?raw";
import screen from "./shaders/screen.vert?raw";
import opaque from "./shaders/opaque.frag?raw";
import water from "./shaders/water-geometry.frag?raw";
import composite from "./shaders/water-composite.frag?raw";
import display from "./shaders/display.frag?raw";
import shadow from "./shaders/shadow.frag?raw";
import deferred from "./shaders/deferred.frag?raw";
import reflection from "./shaders/reflection.frag?raw";
import ssao from "./shaders/ssao.frag?raw";
import aoFilter from "./shaders/ao-filter.frag?raw";
import atmosphere from "./shaders/atmosphere.frag?raw";
import edges from "./shaders/edges.frag?raw";
import filters from "./shaders/image-filter.frag?raw";
import focus from "./shaders/focus.frag?raw";
import motion from "./shaders/motion.frag?raw";
import bloom from "./shaders/bloom.frag?raw";
import color from "./shaders/color-effects.frag?raw";

export const inspectionGroups = [
  "Output", "Geometry", "Water", "Lighting and AO", "Focus and motion", "Image effects",
] as const;
type Group = typeof inspectionGroups[number];
export type ShaderSource = Readonly<{ vertex: string; fragment: string }>;
type Explanation = Readonly<{ producer: string; consumer: string; description: string }>;
// Values are the existing display.frag modes; changing them requires changing GLSL too.
export type DisplayStyle = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
const style = { color: 0, data: 1, depth: 2, hitUV: 3, alpha: 4, linearDepth: 5,
  position: 6, flow: 7, flowUV: 8, final: 9 } as const;

export type SceneInspectionResources = Readonly<Record<
  "opaque" | "water" | "hit" | "composite" | "shadow" | "deferred" | "reflection" | "aoRaw" | "aoSmooth",
  WebGLRenderTarget
>>;
export type PostInspectionResources = Readonly<Record<
  "atmosphere" | "edge" | "filter" | "dilated" | "blurred" | "dilatedBlur" | "focus" | "motion" |
  "bright" | "legacyBright" | "bloomBlur" | "combined" | "color", WebGLRenderTarget
>>;
type Resources = Readonly<{ scene: SceneInspectionResources; post: PostInspectionResources; hdr: boolean }>;
export type InspectionContext = Readonly<{
  effects: Readonly<Effects>;
  refractionProgram: Pick<RawShaderMaterial, "vertexShader" | "fragmentShader">;
}>;
type SceneWork = Readonly<Partial<Record<"shadow" | "deferred" | "ao" | "forward", boolean>>>;
export type PostInspectionWork = Readonly<Partial<Record<
  "atmosphere" | "outline" | "focus" | "dilation" | "blurred" | "motion" | "filter" | "bloom" | "bloomBlur", boolean
>>>;
type Binding = {
  target: WebGLRenderTarget | "final";
  shader: ShaderSource;
  slot?: number | "depth";
  style?: DisplayStyle;
  scene?: SceneWork;
  post?: PostInspectionWork;
  explanation?: Partial<Explanation>;
};
type Resolver = (resources: Resources, context: InspectionContext) => Binding;
function define(group: Group, [producer, consumer, description]: readonly [string, string, string], resolve: Resolver) {
  return { group, producer, consumer, description, resolve };
}
function shader(fragment: string, geometry = false): ShaderSource {
  return { vertex: geometry ? vertex : screen, fragment: source(fragment) };
}
const shaders = {
  opaque: shader(opaque, true),
  water: shader(water, true),
  composite: shader(composite),
  display: shader(display),
  shadow: shader(shadow, true),
  deferred: shader(deferred),
  reflection: shader(reflection),
  ssao: shader(ssao),
  aoFilter: shader(aoFilter),
  atmosphere: shader(atmosphere),
  edges: shader(edges),
  filters: shader(filters),
  focus: shader(focus),
  motion: shader(motion),
  bloom: shader(bloom),
  color: shader(color),
};
function scene(target: keyof SceneInspectionResources, shader: ShaderSource,
  display: DisplayStyle = style.color, slot: number | "depth" = 0, work: SceneWork = {}): Resolver {
  return r => ({ target: r.scene[target], shader, style: display, slot, scene: work });
}
function post(target: keyof PostInspectionResources, shader: ShaderSource, work: PostInspectionWork,
  display: DisplayStyle = style.color, slot = 0): Resolver {
  return r => ({ target: r.post[target], shader, style: display, slot, post: work });
}
const lighting: Resolver = (r, { effects: fx }) => ({
  target: fx.deferred ? r.scene.deferred : r.scene.opaque,
  slot: fx.deferred ? 1 : 3, shader: fx.deferred ? shaders.deferred : shaders.opaque,
  explanation: { producer: fx.deferred ? "Fullscreen lighting" : "Opaque geometry lighting" },
});
const refraction: Resolver = (r, { refractionProgram }) => ({
  target: r.scene.hit,
  shader: { vertex: refractionProgram.vertexShader, fragment: refractionProgram.fragmentShader },
});
const hdrBloom = (r: Resources, c: InspectionContext) => c.effects.bloom === 2 && r.hdr;

// Definition order preserves the existing menu order within each explicit group.
const definitions = {
  "Fog amount": define("Image effects",
    ["Atmosphere", "Scene color", "Opacity of the native-style near/far ramp or exponential fog."],
    post("atmosphere", shaders.atmosphere, { atmosphere: true }, style.data, 1)),
  "Smoke mask": define("Image effects",
    ["Atmosphere", "Inspector", "Smoke opacity after scene depth clips the plume. Black means clear; brighter means more smoke."],
    post("atmosphere", shaders.atmosphere, { atmosphere: true }, style.data, 2)),
  "Outline edges": define("Image effects",
    ["Outline detection", "Scene color", "Position differences or depth and normal discontinuities."],
    post("edge", shaders.edges, { outline: true }, style.data, 1)),
  "Focus / blur mask": define("Focus and motion",
    ["Depth of field", "Focus composite", "Black stays sharp. White uses the blurred source."],
    post("focus", shaders.focus, { focus: true }, style.data, 1)),
  "Blurred source": define("Focus and motion",
    ["Gaussian blur", "Depth of field", "Scene blurred without dilation; watch foreground color bleed over a depth edge."],
    (r, c) => ({
      target: r.post.blurred, shader: shaders.filters, post: { focus: true, blurred: true },
      explanation: { consumer: c.effects.dilation ? "Inspector only" : "Focus composite" },
    })),
  "Dilated source": define("Focus and motion",
    ["Depth-guided dilation", "Gaussian blur", "Far colors extended under foreground edges before blurring."],
    post("dilated", shaders.focus, { focus: true, dilation: true })),
  "Dilated blur": define("Focus and motion",
    ["Gaussian blur of dilated source", "Depth of field", "Compare this with Blurred source at a near silhouette."],
    (r, c) => ({
      target: r.post.dilatedBlur, shader: shaders.filters, post: { focus: true, dilation: true },
      explanation: { consumer: c.effects.dilation ? "Focus composite" : "Inspector only" },
    })),
  "Depth of field": define("Focus and motion",
    ["Focus composite", "Post processing", "Sharp and blurred inputs mixed by the focus mask."],
    (r, c) => ({
      target: r.post.focus, shader: shaders.focus, post: { focus: true },
      explanation: { consumer: c.effects.dof ? "Post processing" : "Inspector only" },
    })),
  "Motion direction": define("Focus and motion",
    ["Camera reprojection", "Motion blur", "Neutral red/green means still. Offsets encode signed UV motion from the previous camera."],
    post("motion", shaders.motion, { motion: true }, style.data, 1)),
  "Motion blur": define("Focus and motion",
    ["Camera reprojection sampling", "Post processing", "Samples along the current-to-previous pixel direction. No object velocity is stored."],
    (r, c) => ({
      target: r.post.motion, shader: shaders.motion, post: { motion: true },
      explanation: { consumer: c.effects.motion ? "Post processing" : "Inspector only" },
    })),
  "Filtered color": define("Image effects",
    ["Spatial filter", "Color effects", "Box, separable Gaussian or low-variance Kuwahara sampling."],
    (r, c) => ({
      target: r.post.filter, shader: shaders.filters, post: { filter: true },
      explanation: { producer: ["Unfiltered copy", "Box filter", "Separable Gaussian", "Kuwahara filter"][c.effects.filter],
        consumer: c.effects.filter ? "Color effects" : "Inspector only" },
    })),
  "Bloom extraction": define("Image effects",
    ["Threshold / bright-pass", "Bloom blur or add", "Legacy averages thresholded neighbors. HDR stores the excess above linear white at half resolution."],
    (r, c) => ({
      target: hdrBloom(r, c) ? r.post.bright : r.post.legacyBright, shader: shaders.bloom, post: { bloom: true },
      explanation: hdrBloom(r, c)
        ? { producer: "HDR bright-pass", consumer: "Bloom blur", description: "Excess above linear white at half resolution, before Gaussian blur." }
        : { producer: "Legacy thresholded neighborhood", consumer: "Bloom add",
            description: "Thresholded neighbors averaged at full resolution. Legacy bloom add consumes this extraction directly." },
    })),
  "Bloom blur": define("Image effects",
    ["Half-resolution Gaussian blur", "Bloom add", "Half-resolution blur of extraction. The active bloom path determines whether addition consumes it."],
    (r, c) => ({
      target: r.post.bloomBlur, shader: shaders.filters, post: { bloom: true, bloomBlur: true },
      explanation: hdrBloom(r, c)
        ? { consumer: "Bloom add", description: "HDR highlight energy spread in horizontal and vertical passes at half resolution." }
        : { consumer: "Inspector only", description: "Half-resolution blur of legacy extraction for inspection only. Legacy bloom add uses extraction directly, without this blur." },
    })),
  "Bloom combined": define("Image effects",
    ["Bloom add", "Tone mapping", "Linear scene radiance plus the bloom layer."],
    (r, c) => ({
      target: r.post.combined, shader: shaders.bloom, post: { bloom: true },
      explanation: { consumer: hdrBloom(r, c) ? "Tone mapping" : c.effects.bloom === 1 ? "Color effects" : "Inspector only",
        description: hdrBloom(r, c) ? "Linear scene radiance plus blurred HDR highlights, before tone mapping."
          : "Scene color plus legacy thresholded extraction. With bloom off, this preview is not used in the final image." },
    })),
  "Display linear": define("Output",
    ["Tone and image effects", "LUT / split toning", "Display-range linear RGB before grading and output encoding."],
    post("color", shaders.color, {}, style.data, 1)),
  "Graded linear": define("Output",
    ["LUT / split toning", "Output encoding", "Linear result of the grade. The LUT pass decodes the table result back to linear."],
    post("color", shaders.color, {}, style.data)),
  "Final color": define("Output",
    ["Display output", "Screen", "The final image, with the selected display curve applied once."],
    () => ({ target: "final", shader: shaders.display, style: style.final })),
  "Opaque color": define("Lighting and AO",
    ["Forward or deferred opaque lighting", "Water composite", "Lit opaque scene, with no water drawn into it."],
    (r, c) => ({
      target: c.effects.deferred ? r.scene.deferred : r.scene.opaque, slot: c.effects.deferred ? 0 : 2,
      shader: c.effects.deferred ? shaders.deferred : shaders.opaque,
      explanation: { producer: c.effects.deferred ? "Fullscreen lighting" : "Opaque geometry lighting" },
    })),
  "Albedo": define("Geometry",
    ["Opaque geometry", "Material inspection", "Sampled color map before lighting."],
    scene("opaque", shaders.opaque)),
  "Encoded normals": define("Geometry",
    ["Opaque geometry", "Geometry inspection", "View-space direction packed from −1…1 into RGB."],
    scene("opaque", shaders.opaque, style.data, 1)),
  "Raw depth": define("Geometry",
    ["Opaque depth attachment", "Water ray search", "Hardware depth concentrates precision near the camera."],
    scene("opaque", shaders.opaque, style.depth, "depth")),
  "Linear depth": define("Geometry",
    ["Opaque depth attachment", "View-space reconstruction", "A linear remap of reconstructed camera distance."],
    scene("opaque", shaders.opaque, style.linearDepth, "depth")),
  "View position": define("Geometry",
    ["Opaque depth attachment", "Water ray search", "View-space XYZ reconstructed from depth; displayed relative to the target plane."],
    scene("opaque", shaders.opaque, style.position, "depth")),
  "Water mask": define("Water",
    ["Water geometry + depth test", "Water composite", "Only water in front of opaque geometry is eligible."],
    (r, c) => ({ ...refraction(r, c), style: style.alpha })),
  "Refraction hit UV": define("Water",
    ["Refraction ray search", "Water composite", "Red and green encode hit U and V. Rust marks a miss; the composite uses the original UV."],
    (r, c) => ({ ...refraction(r, c), style: style.hitUV })),
  "Refracted color": define("Water",
    ["Water composite", "Display output", "The sampled opaque image with water tint. Misses keep the undistorted sample."],
    scene("composite", shaders.composite, style.color, 1)),
  "Shadow map": define("Lighting and AO",
    ["Light-space geometry", "Opaque lighting", "Depth seen by the sun or moon. The light cannot reach a fragment behind this stored depth."],
    (r, c) => ({
      target: r.scene.shadow, shader: shaders.shadow, style: style.depth, slot: "depth", scene: { shadow: true },
      explanation: { consumer: c.effects.shadows ? "Opaque lighting" : "Inspector only" },
    })),
  "Shadow visibility": define("Lighting and AO",
    ["Opaque lighting", "Opaque color", "White receives direct light; dark areas are blocked in the light's view."],
    (r, c) => ({ ...lighting(r, c), style: style.alpha })),
  "Specular": define("Lighting and AO",
    ["Opaque lighting", "Opaque color", "Only the direct highlight contribution."],
    lighting),
  "Forward color": define("Lighting and AO",
    ["Opaque geometry lighting", "Water composite", "Lighting evaluated on visible mesh fragments in the geometry pass."],
    scene("opaque", shaders.opaque, style.color, 2, { forward: true })),
  "Deferred color": define("Lighting and AO",
    ["Fullscreen lighting", "Water composite", "Lighting evaluated from G-buffer color, normals, specular mask and reconstructed view position."],
    (r, c) => ({
      target: r.scene.deferred, shader: shaders.deferred, scene: { deferred: true },
      explanation: { consumer: c.effects.deferred ? "Water composite" : "Inspector only" },
    })),
  "SSAO raw": define("Lighting and AO",
    ["SSAO hemisphere samples", "Bilateral AO filter", "Lower visibility marks nearby depth blockers in the hemisphere around the normal."],
    scene("aoRaw", shaders.ssao, style.data, 0, { ao: true })),
  "SSAO filtered": define("Lighting and AO",
    ["Bilateral AO filter", "Water composite", "Smoothed occlusion that avoids mixing distant surfaces across a depth edge."],
    (r, c) => ({
      target: r.scene.aoSmooth, shader: shaders.aoFilter, style: style.data, scene: { ao: true },
      explanation: { consumer: c.effects.ao ? "Water composite" : "Inspector only" },
    })),
  "Reflection mask": define("Water",
    ["Water geometry + depth test", "Water composite", "Visible reflection coverage from the authored material mask."],
    scene("reflection", shaders.reflection, style.alpha)),
  "Reflection hit UV": define("Water",
    ["Reflection ray search", "Water composite", "Hit UV in red/green; blue tracks visibility near the frame edge; rust marks a miss."],
    scene("reflection", shaders.reflection, style.hitUV)),
  "Fresnel weight": define("Water",
    ["Water composite", "Scene color", "The blend weight for reflected light. With Fresnel on, grazing views are brighter."],
    scene("composite", shaders.composite, style.alpha, 3)),
  "Reflection color": define("Water",
    ["Water composite", "Scene color", "Visible reflected opaque color. Missing rays fall back to sky in the composite."],
    scene("composite", shaders.composite, style.color, 2)),
  "Foam": define("Water",
    ["Water composite", "Scene color", "Pattern weighted by the depth gap between water and geometry."],
    scene("composite", shaders.composite, style.data, 3)),
  "Flow direction": define("Water",
    ["Water geometry", "Water normals", "Red and green encode the signed texture-space flow vector."],
    scene("water", shaders.water, style.flow, 2)),
  "Flow UV": define("Water",
    ["Water geometry", "Water normals", "Red and green display the moving fractional UV, as used to sample the normal texture."],
    scene("water", shaders.water, style.flowUV, 2)),
  "Water depth": define("Geometry",
    ["Water depth attachment", "Water ray search", "Depth of the closest water surface before testing opaque visibility."],
    scene("water", shaders.water, style.linearDepth, "depth")),
  "Water normals": define("Water",
    ["Water geometry", "Refraction ray search", "Tangent-space ripples transformed into view space."],
    scene("water", shaders.water, style.data)),
};
export type BufferName = keyof typeof definitions;
export type ViewInfo = Explanation & Readonly<{ name: BufferName; group: Group }>;
export type ResolvedView = Readonly<{
  info: ViewInfo;
  shader: ShaderSource;
  work: Readonly<{ scene: SceneWork; post: PostInspectionWork }>;
  image(finalOutput: Texture): { texture: Texture; style: DisplayStyle };
}>;
export const inspectionCatalog: readonly Pick<ViewInfo, "name" | "group">[] = Object.entries(definitions)
  .map(([name, definition]) => ({ name: name as BufferName, group: definition.group }));

export class BufferInspection {
  readonly catalog = inspectionCatalog;
  constructor(private readonly resources: Resources) {}

  resolve(name: BufferName, context: InspectionContext): ResolvedView {
    const definition = definitions[name];
    const binding = definition.resolve(this.resources, context);
    const { target, slot = 0 } = binding;
    // Catch a broken attachment binding at the production seam, before drawing.
    const texture = target === "final" ? undefined : slot === "depth" ? target.depthTexture : target.textures[slot];
    if (target !== "final" && !texture) throw new Error(`Missing inspection attachment: ${name} (${slot})`);
    return {
      info: { name, group: definition.group, producer: definition.producer, consumer: definition.consumer,
        description: definition.description, ...binding.explanation },
      shader: binding.shader,
      work: { scene: binding.scene ?? {}, post: binding.post ?? {} },
      image: finalOutput => ({ texture: texture ?? finalOutput, style: binding.style ?? style.color }),
    };
  }
}
