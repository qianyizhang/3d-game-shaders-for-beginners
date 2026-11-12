precision highp float;
in vec2 screenUV;
out vec4 hitUV;
uniform sampler2D opaqueDepth;
uniform sampler2D waterDepth;
uniform sampler2D waterNormal;
uniform sampler2D waterMasks;
uniform bool enabled;
#include <lab_depth>

void main() {
  float d = texture(waterDepth, screenUV).r;
  float mask = d < texture(opaqueDepth, screenUV).r ? texture(waterMasks, screenUV).g : 0.0;
  hitUV = vec4(screenUV, 0.0, mask);
  if (!enabled || mask <= 0.0) return;
  vec3 start = viewPosition(screenUV, d);
  vec3 n = normalize(texture(waterNormal, screenUV).rgb * 2.0 - 1.0);
  vec3 direction = reflect(normalize(start), n);
  float previous = 0.07;
  for (int i = 1; i <= 56; ++i) {
    float distanceAlong = float(i) * (14.0 / 56.0);
    vec3 p = start + direction * distanceAlong;
    vec2 uv = projectUV(p);
    if (!inFrame(uv) || p.z >= 0.0) return;
    float depth = texture(opaqueDepth, uv).r;
    vec3 q = viewPosition(uv, depth);
    if (depth < 1.0 && p.z <= q.z) {
      float lo = previous, hi = distanceAlong;
      for (int j = 0; j < 5; ++j) {
        float m = (lo + hi) * 0.5;
        vec3 probe = start + direction * m;
        vec2 at = projectUV(probe);
        if (probe.z <= viewPosition(at, texture(opaqueDepth, at).r).z) hi = m; else lo = m;
      }
      vec3 hit = start + direction * hi;
      vec2 at = projectUV(hit);
      float gap = viewPosition(at, texture(opaqueDepth, at).r).z - hit.z;
      float edge = min(min(at.x, 1.0 - at.x), min(at.y, 1.0 - at.y));
      if (gap < 0.26 && hi > 0.16) hitUV = vec4(at, smoothstep(0.0, 0.06, edge), mask);
      return;
    }
    previous = distanceAlong;
  }
}
