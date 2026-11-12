in vec3 viewPoint;
in vec3 viewNormal;
in vec3 viewTangent;
in vec3 viewBitangent;
in vec2 texUV;

vec3 tangentNormal(vec3 sampleN) {
  vec3 n = normalize(viewNormal) * (gl_FrontFacing ? 1.0 : -1.0);
  vec3 t = normalize(viewTangent - n * dot(n, viewTangent));
  vec3 b = normalize(viewBitangent - n * dot(n, viewBitangent));
  return normalize(mat3(t, b, n) * sampleN);
}
