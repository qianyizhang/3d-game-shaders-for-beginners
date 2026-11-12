uniform mat4 projection;
uniform mat4 inverseProjection;
vec3 viewPosition(vec2 uv, float depth) {
  vec4 p = inverseProjection * vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  return p.xyz / p.w;
}
vec2 projectUV(vec3 position) {
  vec4 p = projection * vec4(position, 1.0);
  return p.xy / p.w * 0.5 + 0.5;
}
bool inFrame(vec2 uv) {
  return all(greaterThanEqual(uv, vec2(0.0))) && all(lessThan(uv, vec2(1.0)));
}
