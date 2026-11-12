precision highp float;
in vec2 screenUV;
out vec4 ao;
uniform sampler2D depthTexture;
uniform sampler2D normalTexture;
uniform float radius;
#include <lab_depth>

void main() {
  float d = texture(depthTexture, screenUV).r;
  ao = vec4(1.0);
  if (d >= 1.0) return;
  vec3 p = viewPosition(screenUV, d);
  vec3 n = normalize(texture(normalTexture, screenUV).rgb * 2.0 - 1.0);
  vec3 axis = abs(n.z) > 0.8 ? vec3(0.0, 1.0, 0.0) : vec3(0.0, 0.0, 1.0);
  vec3 t = normalize(cross(n, axis));
  mat3 basis = mat3(t, cross(n, t), n);
  float angleOffset = 6.283185 * fract(dot(mod(gl_FragCoord.xy, 4.0), vec2(0.06711, 0.1732)));
  float occlusion = 0.0;
  for (int i = 0; i < 16; ++i) {
    float f = (float(i) + 0.5) / 16.0;
    float a = float(i) * 2.399963 + angleOffset;
    float z = mix(0.15, 0.94, f);
    vec3 direction = vec3(vec2(cos(a), sin(a)) * sqrt(1.0 - z*z), z);
    vec3 probe = p + radius * mix(0.23, 1.0, f*f) * (basis * direction);
    vec2 uv = projectUV(probe);
    if (!inFrame(uv)) continue;
    float test = texture(depthTexture, uv).r;
    vec3 q = viewPosition(uv, test);
    float weight = 1.0 - smoothstep(radius * 0.6, radius * 1.6, length(p - q));
    if (test < 1.0 && q.z > probe.z + 0.025) occlusion += weight;
  }
  ao = vec4(vec3(1.0 - occlusion / 16.0), 1.0);
}
