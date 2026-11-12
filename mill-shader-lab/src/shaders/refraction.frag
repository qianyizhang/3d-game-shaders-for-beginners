precision highp float;
in vec2 screenUV;
layout(location = 0) out vec4 hitUV;
uniform sampler2D opaqueDepth;
uniform sampler2D waterDepth;
uniform sampler2D waterNormal;
uniform sampler2D waterMasks;
uniform float relativeIndex;
uniform bool enabled;

#include <lab_depth>

void main() {
  float wd = texture(waterDepth, screenUV).r;
  float mask = wd < texture(opaqueDepth, screenUV).r ? texture(waterMasks, screenUV).r : 0.0;
  hitUV = vec4(screenUV, 0.0, mask);
  if (!enabled || mask <= 0.0) return;

  vec3 start = viewPosition(screenUV, wd);
  vec3 incident = normalize(start);
  vec3 n = normalize(texture(waterNormal, screenUV).rgb * 2.0 - 1.0);
  if (dot(incident, n) > 0.0) n = -n;
  vec3 bent = refract(incident, n, relativeIndex);
  if (dot(bent, bent) < 1e-6) return; // Total internal reflection: no transmitted hit.
  vec3 direction = normalize(mix(incident, bent, EDIT_BEND));
  float previous = 0.025;
  for (int i = 1; i <= 40; ++i) {
    float distanceAlong = float(i) * (5.0 / 40.0);
    vec3 p = start + direction * distanceAlong;
    vec2 uv = projectUV(p);
    if (!inFrame(uv) || p.z >= 0.0) return;
    float d = texture(opaqueDepth, uv).r;
    vec3 opaque = viewPosition(uv, d);
    if (d < 1.0 && opaque.z < start.z - 0.015 && p.z <= opaque.z) {
      float lo = previous;
      float hi = distanceAlong;
      for (int j = 0; j < 5; ++j) {
        float m = (lo + hi) * 0.5;
        vec3 q = start + direction * m;
        vec2 at = projectUV(q);
        float sampleDepth = texture(opaqueDepth, at).r;
        vec3 surface = viewPosition(at, sampleDepth);
        if (sampleDepth < 1.0 && surface.z < start.z - 0.015 && q.z <= surface.z) hi = m;
        else lo = m;
      }
      vec3 hit = start + direction * hi;
      vec2 at = projectUV(hit);
      float surfaceZ = viewPosition(at, texture(opaqueDepth, at).r).z;
      // Reject large jumps at a silhouette, where no local crossing occurred.
      if (surfaceZ - hit.z < 0.5) hitUV = vec4(at, 1.0, mask);
      return;
    }
    previous = distanceAlong;
  }
}
