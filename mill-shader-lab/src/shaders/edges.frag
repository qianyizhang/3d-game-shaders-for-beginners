precision highp float;
in vec2 screenUV;
layout(location = 0) out vec4 color;
layout(location = 1) out vec4 edgeMask;
uniform sampler2D inputColor;
uniform sampler2D opaqueDepth;
uniform sampler2D waterDepth;
uniform sampler2D opaqueNormal;
uniform sampler2D waterNormal;
uniform int mode;
uniform float threshold;
#include <lab_depth>

float depthAt(vec2 uv) { return min(texture(opaqueDepth, uv).r, texture(waterDepth, uv).r); }
vec3 normalAt(vec2 uv) {
  bool water = texture(waterDepth, uv).r < texture(opaqueDepth, uv).r;
  return normalize((water ? texture(waterNormal, uv).rgb : texture(opaqueNormal, uv).rgb) * 2.0 - 1.0);
}
void main() {
  vec3 c = texture(inputColor, screenUV).rgb;
  vec2 texel = 1.0 / vec2(textureSize(inputColor, 0));
  float d = depthAt(screenUV);
  vec3 p = viewPosition(screenUV, d);
  vec3 n = normalAt(screenUV);
  float edge = 0.0;
  for (int i = 0; i < 4; ++i) {
    vec2 direction = i == 0 ? vec2(1,0) : i == 1 ? vec2(-1,0) : i == 2 ? vec2(0,1) : vec2(0,-1);
    vec2 uv = screenUV + direction * texel;
    float dd = depthAt(uv);
    if (d >= 1.0 && dd >= 1.0) continue;
    if (d >= 1.0 || dd >= 1.0) { edge = 1.0; continue; }
    vec3 q = viewPosition(uv, dd);
    float delta = mode == 1 ? length(q - p) : max(abs(q.z - p.z), 0.65 * length(normalAt(uv) - n));
    edge = max(edge, smoothstep(threshold * 0.6, threshold * 1.6, delta));
  }
  color = vec4(mix(c, c * vec3(0.26, 0.30, 0.42), edge * 0.78), 1.0);
  edgeMask = vec4(vec3(edge), 1.0);
}
