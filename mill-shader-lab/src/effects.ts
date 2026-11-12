export const defaults = {
  texture: 1, normals: 1, lighting: 2, shininess: 35, roughness: 0.34, metalness: 0,
  swatch: 0, shadows: 0, fresnel: 0, rim: 0, cel: 0, deferred: 0, ao: 0, aoRadius: 0.6,
  refraction: 1, rior: 1.05, reflection: 0, ripples: 1, foam: 0, foamDepth: 1.5,
  fog: 0, fogNear: 2, fogFar: 9, density: 0.18, outline: 0, outlineThreshold: 0.22,
  dof: 0, dilation: 1, aperture: 1.3, motion: 0, motionStrength: 1,
  filter: 0, blurSize: 2, bloom: 0, bloomStrength: 0.7, poster: 0, posterStyle: 0, levels: 6,
  pixel: 0, blockSize: 9, pixelBackground: 1, sharpen: 0, sharpness: 0.9,
  grain: 0, grainAmount: 0.075, chromatic: 0, fringe: 0.017,
  grade: 0, encoding: 0, grayRamp: 0, smoke: 0,
};
export type Effects = typeof defaults;
export type Effect = keyof Effects;

export const legacyEffects: Partial<Effects> = {
  texture: 1, normals: 1, lighting: 2, shadows: 1, fresnel: 1, rim: 1, cel: 1,
  refraction: 1, rior: 1.05, reflection: 1, ripples: 1, foam: 1, foamDepth: 1.5,
  fog: 1, fogNear: 2, fogFar: 9, outline: 1, dof: 1, bloom: 1,
  sharpen: 1, grain: 1, chromatic: 1, grade: 4, encoding: 1, smoke: 1,
};

export const modes = {
  texture: ["UV checker", "Color map"],
  normals: ["Flat normal", "Tangent-space map", "Procedural"],
  lighting: ["Diffuse", "Phong", "Blinn–Phong", "GGX"],
  ripples: ["Mirror", "Rippled"],
  fog: ["Off", "Legacy ramp", "Exponential"],
  outline: ["Off", "Position edges", "Depth / normal edges"],
  filter: ["Off", "Box", "Separable Gaussian", "Kuwahara"],
  bloom: ["Off", "Legacy neighborhood", "HDR bright-pass"],
  chromatic: ["Off", "Fixed center", "Picked focus"],
  posterStyle: ["Legacy brightness", "RGB channels"],
  grade: ["Off", "Neutral LUT", "Day LUT", "Night LUT", "Day / night LUT", "Split toning"],
  encoding: ["Exact sRGB", "Legacy power"],
} as const satisfies Partial<Record<Effect, readonly string[]>>;
