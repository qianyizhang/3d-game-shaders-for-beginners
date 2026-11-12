precision highp float;
in vec2 screenUV;
out vec4 filtered;
uniform sampler2D rawAO;
uniform sampler2D depthTexture;
uniform sampler2D normalTexture;
#include <lab_depth>

void main() {
  float depth = texture(depthTexture, screenUV).r;
  filtered = vec4(1.0);
  if (depth >= 1.0) return;
  vec3 p = viewPosition(screenUV, depth);
  vec3 n = normalize(texture(normalTexture, screenUV).rgb * 2.0 - 1.0);
  vec2 texel = 1.0 / vec2(textureSize(rawAO, 0));
  float total = 0.0;
  float weights = 0.0;
  for (int y = -2; y <= 2; ++y) for (int x = -2; x <= 2; ++x) {
    vec2 uv = screenUV + vec2(x, y) * texel;
    float d = texture(depthTexture, uv).r;
    float z = viewPosition(uv, d).z;
    vec3 q = normalize(texture(normalTexture, uv).rgb * 2.0 - 1.0);
    float w = exp(-abs(z - p.z) * 4.0) * pow(max(dot(n, q), 0.0), 3.0);
    total += w * texture(rawAO, uv).r;
    weights += w;
  }
  filtered = vec4(vec3(total / max(weights, 0.001)), 1.0);
}
