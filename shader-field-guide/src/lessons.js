/** Small, inspectable lessons. Shader fragments are illustrative, not pasted from the source tutorial. */
export const LESSONS = [
  {
    id: 'pbr', group: 'SURFACE', title: 'Microfacet PBR', number: '01',
    baseline: 'Lambert diffuse', after: 'GGX microfacet BRDF',
    shader: 0, beforeShader: 1, post: 0, data: 'world position · normal · base color · roughness · metalness',
    stage: 'Fragment · geometry pass',
    intuition: 'A material is not just a highlight exponent. Roughness controls the distribution of microscopic surface normals; metalness changes how light splits between diffuse and specular reflection.',
    snippet: `vec3 H  = normalize(L + V);\nfloat a = max(0.035, roughness * roughness);\nfloat D = D_GGX(max(dot(N, H), 0.0), a);\nvec3 F = F_Schlick(max(dot(V, H), 0.0), F0);\nfloat G = G_Schlick(NoL, roughness) * G_Schlick(NoV, roughness);\nvec3 specular = D * G * F / max(4.0 * NoL * NoV, 1e-4);`,
    caveat: 'The live demo implements direct lights and a minimal ambient approximation, not a complete image-based-lighting (IBL) renderer.'
  },
  {
    id: 'blinn', group: 'SURFACE', title: 'Blinn–Phong', number: '02',
    baseline: 'Lambert diffuse', after: 'Half-vector specular',
    shader: 2, beforeShader: 1, post: 0, data: 'normal · light direction · view direction', stage: 'Fragment · geometry pass',
    intuition: 'The halfway direction H = normalize(L + V) is the direction between the view and light. Its alignment with the surface normal determines a stylized specular highlight.',
    snippet: `vec3 H = normalize(L + V);\nfloat diffuse = max(dot(N, L), 0.0);\nfloat specular = pow(max(dot(N, H), 0.0), 64.0);\nvec3 lit = baseColor * diffuse + vec3(specular);`,
    caveat: 'Useful for learning or art-directed materials, but its shininess parameter is not equivalent to physical roughness.'
  },
  {
    id: 'normals', group: 'SURFACE', title: 'Normal buffer', number: '03',
    baseline: 'Lit surface', after: 'Encoded normals',
    shader: 0, beforeShader: 0, post: 10, data: 'interpolated normal · render target', stage: 'Geometry pass → debug composite',
    intuition: 'Normals are directional data. Every visible triangle contributes a normal, interpolated across fragments. Encoding N × 0.5 + 0.5 makes the −1…1 vector inspectable as RGB.',
    snippet: `// Geometry fragment output, attached to an FBO:\nlayout(location = 1) out vec4 normalBuffer;\nnormalBuffer = vec4(normalize(worldNormal) * 0.5 + 0.5, 1.0);\n// Later: N = texture(normalBuffer, uv).rgb * 2.0 - 1.0;`,
    caveat: 'This demo stores world-space normals. Any effect combining normals and positions must use compatible coordinate spaces.'
  },
  {
    id: 'depth', group: 'BUFFERS', title: 'Depth reconstruction', number: '04',
    baseline: 'Lit surface', after: 'Linearized camera depth',
    shader: 0, beforeShader: 0, post: 11, data: 'hardware depth texture · near/far planes', stage: 'Geometry pass → post-processing',
    intuition: 'The depth buffer is non-linear. For effects that depend on meters or distances, first reconstruct linear camera depth or a view-space position.',
    snippet: `float linearDepth(float d, float near, float far) {\n  float z = d * 2.0 - 1.0; // OpenGL/WebGL NDC\n  return 2.0 * near * far /\n         (far + near - z * (far - near));\n}`,
    caveat: 'This formula assumes conventional OpenGL depth and a perspective projection. Reversed-Z and WebGPU depth conventions require different handling.'
  },
  {
    id: 'detail', group: 'SURFACE', title: 'Normal detail', number: '05',
    baseline: 'Smooth normals', after: 'Perturbed normals',
    shader: 6, beforeShader: 0, post: 0, data: 'UV · normal · tangent/bitangent basis', stage: 'Fragment · geometry pass',
    intuition: 'Changing a fragment normal changes lighting without changing the silhouette. A normal map stores tangent-space directions, which are transformed back to world/view space by a TBN basis.',
    snippet: `vec3 tangentN = texture(normalMap, uv).xyz * 2.0 - 1.0;\nmat3 TBN = mat3(T, B, N); // orthonormal world-space basis\nvec3 worldN = normalize(TBN * tangentN);`,
    caveat: 'For zero assets, the live sphere generates a procedural normal perturbation. It demonstrates the effect but is not a baked tangent-space normal texture.'
  },
  {
    id: 'toon', group: 'STYLIZE', title: 'Cel shading', number: '06',
    baseline: 'Continuous lighting', after: 'Quantized light bands',
    shader: 3, beforeShader: 0, post: 0, data: 'surface normal · light direction', stage: 'Fragment · geometry pass',
    intuition: 'Cel shading does not require a fundamentally different geometry pipeline. Discretize a smooth lighting function into a few flat levels.',
    snippet: `float NoL = max(dot(N, L), 0.0);\nfloat band = NoL > 0.72 ? 1.0 :\n             NoL > 0.32 ? 0.62 : 0.24;\nvec3 color = baseColor * band;`,
    caveat: 'A light ramp texture makes band placement artist-editable. Add a depth/normal outline for a stronger cartoon look.'
  },
  {
    id: 'rim', group: 'STYLIZE', title: 'Rim lighting', number: '07',
    baseline: 'Lit surface', after: 'Grazing-angle rim',
    shader: 4, beforeShader: 0, post: 0, data: 'surface normal · view direction', stage: 'Fragment · geometry pass',
    intuition: 'At grazing view angles, dot(N, V) approaches zero. That yields a controllable band near silhouettes, useful for stylization and selection affordances.',
    snippet: `float facing = max(dot(N, V), 0.0);\nfloat rim = pow(1.0 - facing, 3.0);\ncolor += rim * vec3(0.20, 0.65, 1.0);`,
    caveat: 'A rim-light term is art-directed emission. It is not a substitute for the Fresnel term in an energy-aware PBR BRDF.'
  },
  {
    id: 'fog', group: 'SPACE', title: 'Depth fog', number: '08',
    baseline: 'Clear atmosphere', after: 'Exponential fog',
    shader: 0, beforeShader: 0, post: 1, data: 'scene color · depth · fog density', stage: 'Full-screen post pass',
    intuition: 'Distance-dependent transmission attenuates scene radiance. In the simplest homogeneous fog model, transmittance falls off exponentially with travel distance.',
    snippet: `float viewZ = linearDepth(texture(depth, uv).r, near, far);\nfloat transmission = exp(-density * viewZ);\nvec3 fogged = mix(fogColor, sceneColor, transmission);`,
    caveat: 'This is constant-density distance fog. Height fog and volumetric scattering need integration along the camera ray and shadowing information.'
  },
  {
    id: 'outline', group: 'SPACE', title: 'Depth/normal outlines', number: '09',
    baseline: 'Smooth raster output', after: 'Detected discontinuities',
    shader: 0, beforeShader: 0, post: 2, data: 'linear depth · normal buffer · neighbor samples', stage: 'Full-screen post pass',
    intuition: 'An outline is an image-space discontinuity. Compare depth and normal values to nearby pixels; a sufficiently large change indicates an object boundary or crease.',
    snippet: `vec2 px = 1.0 / vec2(textureSize(normalTex, 0));\nvec3 n0 = texture(normalTex, uv).xyz * 2.0 - 1.0;\nvec3 nx = texture(normalTex, uv + vec2(px.x, 0)).xyz * 2.0 - 1.0;\nfloat edge = smoothstep(0.15, 0.50, length(nx - n0));`,
    caveat: 'Screen-space outlines cannot recover hidden lines. Tune depth thresholds with distance to avoid excessive outlines on far geometry.'
  },
  {
    id: 'bloom', group: 'POST', title: 'HDR bloom', number: '10',
    baseline: 'Tonemapped scene', after: 'Bright-pass + blur + combine',
    shader: 0, beforeShader: 0, post: 3, data: 'linear HDR scene color · half-resolution blur', stage: '3 post passes + output transform',
    intuition: 'Light sources can exceed display white. Extract this HDR excess, blur it cheaply at reduced resolution, then add it back before tone mapping.',
    snippet: `vec3 bright = max(hdrColor - vec3(1.0), 0.0);\n// Downsample and blur bright into a smaller target.\nvec3 combined = hdrColor + blurredBright * bloomStrength;\nvec3 displayLinear = toneMap(combined);\nvec3 displaySRGB = linearToSRGB(displayLinear);`,
    caveat: 'This live example uses one half-resolution, separable Gaussian level. Production bloom commonly uses several mip levels and more careful energy calibration.'
  },
  {
    id: 'blur', group: 'POST', title: 'Spatial blur', number: '11',
    baseline: 'Original scene', after: 'Gaussian-weighted neighbors',
    shader: 0, beforeShader: 0, post: 4, data: 'scene color · texel size · sampling kernel', stage: 'Full-screen post pass',
    intuition: 'A blur is a weighted average of neighboring pixels. Gaussian blur prioritizes close neighbors; a separable implementation turns a 2D kernel into horizontal and vertical 1D passes.',
    snippet: `float w[4] = float[4](0.1945946, 0.1216216, 0.054054, 0.016216);\nvec3 result = texture(inputTex, uv).rgb * 0.227027;\nfor (int i = 1; i <= 4; ++i) {\n  vec2 d = direction * texelSize * float(i);\n  result += w[i-1] * (texture(inputTex, uv + d).rgb\n                      + texture(inputTex, uv - d).rgb);\n}`,
    caveat: 'The full-screen comparison uses a compact 9-tap 2D kernel. The bloom path demonstrates a true two-pass separable blur.'
  },
  {
    id: 'poster', group: 'STYLIZE', title: 'Posterization', number: '12',
    baseline: 'Continuous tones', after: 'Discrete color levels',
    shader: 0, beforeShader: 0, post: 5, data: 'tonemapped scene color', stage: 'Output / color-grading pass',
    intuition: 'Reduce continuous color values to a small fixed palette. Quantizing channels independently is the minimal version; palette mapping and luminance-preserving quantization can look better.',
    snippet: `float levels = 6.0;\nvec3 quantized = floor(color * levels + 0.5) / levels;`,
    caveat: 'Quantization can visibly band smooth gradients. Dithering trades small amounts of structured noise for reduced banding.'
  },
  {
    id: 'pixel', group: 'STYLIZE', title: 'Pixelation', number: '13',
    baseline: 'Native resolution', after: 'Block-sampled scene',
    shader: 0, beforeShader: 0, post: 6, data: 'scene color · framebuffer resolution', stage: 'Full-screen post pass',
    intuition: 'Map every block of screen pixels to one representative sample. Doing this at the UV lookup stage gives a pixellated image without changing scene geometry.',
    snippet: `vec2 size = vec2(textureSize(sceneTex, 0));\nvec2 cell = vec2(9.0);\nvec2 center = (floor(uv * size / cell) + 0.5) * cell;\nvec3 color = texture(sceneTex, center / size).rgb;`,
    caveat: 'For authentic pixel-art presentation, render the scene at a genuinely lower resolution and upscale with nearest-neighbor filtering.'
  },
  {
    id: 'grade', group: 'POST', title: 'Color grading', number: '14',
    baseline: 'Neutral output', after: 'Warm shadows / cool highlights',
    shader: 0, beforeShader: 0, post: 7, data: 'scene color · tone-mapping stage', stage: 'Output / color-grading pass',
    intuition: 'Color grading remaps image appearance after lighting. A 3D LUT is the scalable general solution; here a compact split-tone transform makes the idea visible.',
    snippet: `float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));\nvec3 shadows = vec3(1.07, 0.95, 0.83);\nvec3 highs   = vec3(0.89, 1.03, 1.12);\ncolor *= mix(shadows, highs, smoothstep(0.1, 0.9, luma));`,
    caveat: 'This is split toning, not a real 3D LUT. For production, sample a calibrated 3D LUT in a specified working color space.'
  },
  {
    id: 'grain', group: 'POST', title: 'Film grain', number: '15',
    baseline: 'Clean output', after: 'Subtle stochastic grain',
    shader: 0, beforeShader: 0, post: 8, data: 'screen pixel coordinates · frame index', stage: 'Final display pass',
    intuition: 'A small noise field adds texture to broad smooth gradients. A stable pixel hash avoids the patterned artifacts of naïve sin(dot(...)) noise.',
    snippet: `uint hash(uint x) {\n  x ^= x >> 16; x *= 0x7feb352du;\n  x ^= x >> 15; x *= 0x846ca68bu;\n  return x ^ (x >> 16);\n}\nfloat noise = float(hash(pixelId)) / 4294967295.0 - 0.5;`,
    caveat: 'Film grain can interfere with temporal accumulation and compression. Apply it late, after TAA/upscaling, when available.'
  },
  {
    id: 'chromatic', group: 'POST', title: 'Chromatic aberration', number: '16',
    baseline: 'Aligned RGB', after: 'Separated channel sampling',
    shader: 0, beforeShader: 0, post: 9, data: 'scene color · per-channel UV offset', stage: 'Full-screen post pass',
    intuition: 'Sample red and blue at slightly different UV coordinates, increasing offset away from the image center. The result resembles lens color fringing.',
    snippet: `vec2 delta = uv - 0.5;\nvec2 shift = delta * 0.012;\nvec3 color = vec3(\n  texture(sceneTex, uv + shift).r,\n  texture(sceneTex, uv).g,\n  texture(sceneTex, uv - shift).b\n);`,
    caveat: 'Usually best kept very subtle; overuse reduces legibility and causes unwanted fringing around UI.'
  },
  {
    id: 'sharpen', group: 'POST', title: 'Sharpen', number: '17',
    baseline: 'Unmodified image', after: 'Five-tap Laplacian',
    shader: 0, beforeShader: 0, post: 12, data: 'scene color · pixel neighbors', stage: 'Full-screen post pass',
    intuition: 'Sharpening boosts local contrast. A small Laplacian kernel subtracts neighbors from the center sample; too much creates ringing and amplifies aliasing.',
    snippet: `vec2 p = 1.0 / vec2(textureSize(sceneTex, 0));\nvec3 c = texture(sceneTex, uv).rgb;\nvec3 n = texture(sceneTex, uv + vec2(p.x,0)).rgb\n       + texture(sceneTex, uv - vec2(p.x,0)).rgb\n       + texture(sceneTex, uv + vec2(0,p.y)).rgb\n       + texture(sceneTex, uv - vec2(0,p.y)).rgb;\nvec3 sharp = c * (1.0 + 4.0*amount) - n*amount;`,
    caveat: 'Avoid sharpening before anti-aliasing/upscaling. Temporal-aware or contrast-adaptive sharpeners are often preferable.'
  }
];

export const GROUPS = [
  { key: 'SURFACE', label: 'Surface & lighting', summary: 'Geometry and material evaluation' },
  { key: 'BUFFERS', label: 'Data & framebuffers', summary: 'What every screen-space effect reads' },
  { key: 'SPACE', label: 'Depth & structure', summary: 'Working with scene buffers' },
  { key: 'POST', label: 'Compositing & color', summary: 'Full-screen image operations' },
  { key: 'STYLIZE', label: 'Non-photorealistic', summary: 'Deliberately non-physical looks' },
];
