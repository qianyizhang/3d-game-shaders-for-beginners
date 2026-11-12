import { modes, type Effect, type Effects } from "./effects";
import type { BufferName } from "./lab";
import type { Bookmark } from "./state";

type Range = { key: Effect; label: string; min: number; max: number; step: number; digits?: number };
type Choice = { key: Effect; label: string; choices: readonly string[] };
type Toggle = { key: Effect; label: string };
export type Control = Range | Choice | Toggle;
type Action = "focus" | "sweep" | "edit" | "reflect";
export interface Lesson {
  id: string;
  group: "Geometry and light" | "Water and depth" | "Image and color";
  title: string;
  scene: Bookmark;
  task: string;
  comparison: string;
  initial?: Partial<Effects>;
  reference: Partial<Effects>;
  controls?: readonly Control[];
  views: readonly BufferName[];
  action?: Action;
}
const range = (key: Effect, label: string, min: number, max: number, step: number, digits?: number): Range =>
  ({ key, label, min, max, step, digits });
const toggle = (key: Effect, label: string): Toggle => ({ key, label });
const choose = (key: keyof typeof modes, label: string): Choice => ({ key, label, choices: modes[key] });

export const lessons: readonly Lesson[] = [
  {
    id: "spaces", group: "Geometry and light", title: "Spaces, GLSL and render targets", scene: "Overview",
    task: "Pick a point on the mill or wheel. Trace its object, world, view and screen coordinates. Orbit and pick again. Inspect depth and the code that produced it.",
    comparison: "A shows final color. Use the buffer choices to follow a fragment from geometry to the screen.",
    reference: {}, views: ["Final color", "Albedo", "Encoded normals", "Raw depth", "Linear depth", "View position"],
  },
  {
    id: "material", group: "Geometry and light", title: "Texturing and normal mapping", scene: "Wall and roof",
    task: "Predict what changes the silhouette. Compare a UV checker with the color map. Then pin the color map as A and switch B between flat, sampled and procedural normals. Move the sun in Scene & effects.",
    comparison: "A starts with flat normals. Pin another reference to isolate the color map or normal source.",
    reference: { normals: 0 }, controls: [choose("texture", "Surface color"), choose("normals", "Normal source")],
    views: ["Final color", "Albedo", "Encoded normals"],
  },
  {
    id: "lighting", group: "Geometry and light", title: "Lighting, shadows and specular", scene: "Wall and roof",
    task: "Find a highlight on the roof. Compare diffuse, Phong and Blinn–Phong; change shininess and move the sun. Look at specular and shadow visibility separately.",
    comparison: "A uses diffuse lighting. Shadows and light position stay matched.",
    initial: { shadows: 1 }, reference: { lighting: 0 },
    controls: [choose("lighting", "Lighting model"), range("shininess", "Shininess", 3, 128, 1), toggle("shadows", "Cast shadows")],
    views: ["Final color", "Specular", "Shadow visibility", "Shadow map"],
  },
  {
    id: "ggx", group: "Geometry and light", title: "GGX microfacet lighting", scene: "Wall and roof",
    task: "Watch the copper-colored swatch. Lower roughness to tighten the highlight, then change metalness and look for the loss of diffuse color.",
    comparison: "A uses Blinn–Phong on the same swatch. B starts with GGX.",
    initial: { swatch: 1, lighting: 3, roughness: 0.36, metalness: 0.45, shininess: 34, shadows: 1 },
    reference: { lighting: 2 },
    controls: [choose("lighting", "Lighting model"), range("roughness", "Roughness", 0.07, 0.95, 0.01, 2), range("metalness", "Metalness", 0, 1, 0.01, 2)],
    views: ["Final color", "Specular"],
  },
  {
    id: "stylized", group: "Geometry and light", title: "Fresnel, rim and cel shading", scene: "Across the pond",
    task: "Toggle Fresnel and lower the viewing angle: reflected light strengthens toward grazing angles. Turn Fresnel off, enable rim, and orbit. For cel bands, switch to Wall and roof and move the sun.",
    comparison: "A holds one switch at its reference value after you change a control. Pin all three switches off to compare one at a time.",
    initial: { reflection: 1 }, reference: { fresnel: 0, rim: 0, cel: 0 },
    controls: [toggle("fresnel", "Water Fresnel"), toggle("rim", "Artistic rim"), toggle("cel", "Cel bands")],
    views: ["Final color", "Fresnel weight", "Reflection color", "Opaque color"],
  },
  {
    id: "deferred", group: "Geometry and light", title: "Forward and deferred lighting", scene: "Overview",
    task: "Switch the lighting pass. The same light should land on the same surfaces. Inspect the G-buffer, then view the separately composited water.",
    comparison: "A shades opaque objects during geometry; B reads the G-buffer and shades in a fullscreen pass.",
    initial: { deferred: 1, shadows: 1 }, reference: { deferred: 0 },
    controls: [toggle("deferred", "Use deferred lighting")],
    views: ["Final color", "Forward color", "Deferred color", "Albedo", "Encoded normals", "Raw depth", "Refracted color"],
  },
  {
    id: "refraction", group: "Water and depth", title: "Screen-space refraction", scene: "Waterline",
    task: "Predict which part of the wheel will shift. Change the index, then switch A/B. The wheel above the surface should stay fixed. Look for a rust-colored miss in Hit UV.",
    comparison: "Same camera, clock and scene. A starts at index 1.05 with the stock shader.",
    reference: { rior: 1.05 }, controls: [range("rior", "Relative index", 0.75, 1.34, 0.005, 3)],
    views: ["Final color", "Water mask", "Refraction hit UV", "Refracted color", "Opaque color", "Water depth"], action: "edit",
  },
  {
    id: "reflection", group: "Water and depth", title: "Screen-space reflection", scene: "Across the pond",
    task: "Compare mirror and rippled normals. Orbit or aim down until the reflected dock or bank is no longer in frame. Look for rust in Hit UV where the ray could not find a source.",
    comparison: "A starts with mirror normals. A missed ray samples the sky fallback.",
    initial: { reflection: 1, fresnel: 1 }, reference: { ripples: 0 },
    controls: [choose("ripples", "Water normal"), toggle("reflection", "Reflection")],
    views: ["Final color", "Reflection mask", "Reflection hit UV", "Reflection color", "Water normals"], action: "reflect",
  },
  {
    id: "foam", group: "Water and depth", title: "Foam and flow maps", scene: "Waterline",
    task: "Widen the contact band by increasing foam depth. Inspect the direction field, then step a frame in Flow UV. The water mesh stays put. Turn off flow in Scene & effects to stop the legacy wheel.",
    comparison: "A uses the legacy 1.5-unit foam depth. Step changes the clock for both sides.",
    initial: { foam: 1 }, reference: { foamDepth: 1.5 },
    controls: [range("foamDepth", "Foam depth", 0, 4, 0.1, 1), toggle("foam", "Foam")],
    views: ["Final color", "Foam", "Flow direction", "Flow UV", "Water depth"],
  },
  {
    id: "fog", group: "Water and depth", title: "Depth fog", scene: "Near to far",
    task: "Watch the distant bank and a near wheel spoke. Switch the ramp to exponential, then vary density and check how the fog amount changes with depth.",
    comparison: "A uses the legacy linear ramp. Both curves use distance from the scene's reference plane.",
    initial: { fog: 2 }, reference: { fog: 1 },
    controls: [choose("fog", "Fog curve"), range("fogNear", "Ramp near", -2, 7, 0.25, 2), range("fogFar", "Ramp far", 5, 18, 0.25, 2), range("density", "Density", 0.02, 0.65, 0.01, 2)],
    views: ["Final color", "Fog amount", "Linear depth"],
  },
  {
    id: "smoke", group: "Water and depth", title: "Chimney smoke: sprites and volume", scene: "Chimney",
    task: "Switch A/B with the clock paused. Orbit the chimney and compare how the outline and swirls change. Open Smoke mask to compare opacity, then step a frame to move both plumes together.",
    comparison: "A stacks flat images that face the camera. B steps along each camera ray and accumulates smoke density through 3D space. Both use the same puff positions, sizes and ages.",
    initial: { smoke: 2 }, reference: { smoke: 1 },
    controls: [choose("smoke", "Smoke in B")],
    views: ["Final color", "Smoke mask", "Linear depth"],
  },
  {
    id: "ssao", group: "Water and depth", title: "Screen-space ambient occlusion", scene: "Wall and roof",
    task: "Find a roof corner and a wall seam. Compare raw and filtered occlusion, then increase radius or open Waterline to see the dock joints. The sun stays fixed.",
    comparison: "A has AO off. The AO inspector still runs the diagnostic so you can inspect it before applying it.",
    initial: { ao: 1 }, reference: { ao: 0 },
    controls: [toggle("ao", "Apply AO"), range("aoRadius", "Sample radius", 0.12, 2.2, 0.02, 2)],
    views: ["Final color", "SSAO raw", "SSAO filtered", "Encoded normals"],
  },
  {
    id: "outline", group: "Water and depth", title: "Outlines", scene: "Wall and roof",
    task: "Find a silhouette and a crease. Compare position edges with depth/normal edges. Raise the threshold until small creases drop out.",
    comparison: "A uses position differences. B starts with depth and normal differences.",
    initial: { outline: 2 }, reference: { outline: 1 },
    controls: [choose("outline", "Edge source"), range("outlineThreshold", "Edge threshold", 0.03, 1.2, 0.01, 2)],
    views: ["Final color", "Outline edges", "View position", "Encoded normals"],
  },
  {
    id: "focus", group: "Water and depth", title: "Depth of field and dilation", scene: "Near to far",
    task: "Pick the near dock, then the far mill. Look at the focus mask. Compare the ordinary blurred source and the dilated blur at a foreground edge.",
    comparison: "A blurs without dilation. B extends far colors behind foreground edges before blurring.",
    initial: { dof: 1, dilation: 1 }, reference: { dilation: 0 },
    controls: [toggle("dof", "Depth of field"), toggle("dilation", "Dilate far colors"), range("aperture", "Blur sensitivity", 0.2, 3, 0.1, 1)],
    views: ["Final color", "Focus / blur mask", "Blurred source", "Dilated source", "Dilated blur", "Depth of field"], action: "focus",
  },
  {
    id: "motion", group: "Water and depth", title: "Camera motion blur", scene: "Camera sweep",
    task: "Replay the camera sweep or inspect one sweep frame. Compare A and B there, then use Stopped camera. A stationary camera produces no streak.",
    comparison: "A has blur off. A/B shares the same sampled sweep frame and fixed scene clock.",
    initial: { motion: 1, motionStrength: 1.4 }, reference: { motion: 0 },
    controls: [toggle("motion", "Camera blur"), range("motionStrength", "Shutter length", 0, 3, 0.1, 1)],
    views: ["Final color", "Motion direction", "Motion blur"], action: "sweep",
  },
  {
    id: "filter", group: "Image and color", title: "Blur and painterly filtering", scene: "Wall and roof",
    task: "Look at a roof window edge. Compare box blur, separable Gaussian, and Kuwahara. The last picks a low-variance quadrant. A median filter selects a middle value; it was documented but not wired into the native demo.",
    comparison: "A is unfiltered. Pin one filter as A to compare two kernels.",
    initial: { filter: 1 }, reference: { filter: 0 },
    controls: [choose("filter", "Spatial filter"), range("blurSize", "Sample spacing", 1, 5, 0.5, 1)],
    views: ["Final color", "Filtered color"],
  },
  {
    id: "bloom", group: "Image and color", title: "Bloom", scene: "Night window",
    task: "Compare the bright window and the dull wall. Inspect the HDR extraction, then the half-resolution blur, add, and tone-mapped result. Switch to the legacy thresholded neighborhood filter.",
    comparison: "A uses the legacy filter. B starts with HDR bloom when float rendering is available.",
    initial: { bloom: 2 }, reference: { bloom: 1 },
    controls: [choose("bloom", "Bloom pipeline"), range("bloomStrength", "Bloom strength", 0, 2, 0.05, 2)],
    views: ["Final color", "Bloom extraction", "Bloom blur", "Bloom combined", "Display linear"],
  },
  {
    id: "sampling", group: "Image and color", title: "Posterize, pixelize and sharpen", scene: "Wall and roof",
    task: "Turn on one effect at a time. Compare brightness bands with RGB channel bands, then inspect square samples and finally the ringing around a roof edge. Compare pixelize with and without the legacy foreground mask.",
    comparison: "A starts with all three effects off. Pin A before trying a second variant.",
    reference: { poster: 0, pixel: 0, sharpen: 0 },
    controls: [toggle("poster", "Posterize"), choose("posterStyle", "Band source"), range("levels", "Color steps", 2, 24, 1), toggle("pixel", "Pixelize"), range("blockSize", "Block size", 2, 34, 1),
      toggle("pixelBackground", "Preserve background"), toggle("sharpen", "Sharpen"), range("sharpness", "Sharpen strength", 0, 2, 0.05, 2)],
    views: ["Final color", "Display linear"],
  },
  {
    id: "grain", group: "Image and color", title: "Film grain and chromatic aberration", scene: "Night window",
    task: "Freeze and step the grain. Then use picked-focus fringing and move the focus marker. Compare a window edge near the marker with a distant edge.",
    comparison: "A starts with grain off and fringing from the fixed center. Pin A with matched grain before isolating fringing.",
    initial: { grain: 1, chromatic: 2 }, reference: { grain: 0, chromatic: 1 },
    controls: [toggle("grain", "Film grain"), range("grainAmount", "Grain amount", 0, 0.2, 0.005, 3), choose("chromatic", "Fringe origin"), range("fringe", "Fringe strength", 0, 0.08, 0.002, 3)],
    views: ["Final color", "Display linear"], action: "focus",
  },
  {
    id: "grade", group: "Image and color", title: "LUT and color output", scene: "Overview",
    task: "Compare the neutral, day and night tables with split toning. Turn on the gray ramp and pin A before switching the output curve. The bottom ramp isolates values near black.",
    comparison: "A starts with the neutral table and exact sRGB. The selected output encoding runs once.",
    initial: { grade: 2 }, reference: { grade: 1, encoding: 0 },
    controls: [choose("grade", "Color grade"), choose("encoding", "Output encoding"), toggle("grayRamp", "Gray ramp")],
    views: ["Final color", "Display linear", "Graded linear"],
  },
];
export const firstLesson = lessons.find(lesson => lesson.id === "refraction")!;

export const effectPanel = [
  choose("texture", "Surface color"), choose("normals", "Normal source"), choose("lighting", "Lighting model"),
  toggle("shadows", "Shadows"), toggle("fresnel", "Fresnel"), toggle("rim", "Rim"),
  toggle("cel", "Cel bands"), toggle("deferred", "Deferred"), toggle("ao", "SSAO"),
  toggle("refraction", "Refraction"), toggle("reflection", "Reflection"), choose("ripples", "Water normal"), toggle("foam", "Foam"),
  choose("fog", "Fog"), choose("outline", "Outlines"), toggle("dof", "Depth of field"), toggle("dilation", "Dilate far colors"), toggle("motion", "Motion blur"),
  choose("filter", "Spatial filter"), choose("bloom", "Bloom"), toggle("poster", "Posterize"),
  toggle("pixel", "Pixelize"), toggle("sharpen", "Sharpen"), toggle("grain", "Grain"),
  choose("chromatic", "Fringing"), choose("grade", "Grade"), choose("encoding", "Output encoding"), choose("smoke", "Smoke"),
];
