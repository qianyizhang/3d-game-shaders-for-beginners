precision highp float;
in vec2 screenUV;
layout(location = 0) out vec4 color;
layout(location = 1) out vec4 directionView;
uniform sampler2D inputColor;
uniform sampler2D opaqueDepth;
uniform sampler2D waterDepth;
uniform mat4 inverseView;
uniform mat4 previousViewProjection;
uniform float strength;
#include <lab_depth>

void main() {
  float depth = min(texture(opaqueDepth, screenUV).r, texture(waterDepth, screenUV).r);
  vec2 velocity = vec2(0.0);
  if (depth < 1.0 && strength > 0.0) {
    vec4 world = inverseView * vec4(viewPosition(screenUV, depth), 1.0);
    vec4 previous = previousViewProjection * world;
    if (previous.w > 0.0) velocity = clamp(screenUV - (previous.xy / previous.w * 0.5 + 0.5), -0.075, 0.075);
  }
  directionView = vec4(velocity * 5.0 + 0.5, length(velocity) * 9.0, 1.0);
  if (dot(velocity, velocity) < 1e-10) {
    color = texture(inputColor, screenUV);
    return;
  }
  vec3 sum = vec3(0.0);
  for (int i = -5; i <= 5; ++i) sum += texture(inputColor, screenUV + velocity * float(i) * (strength / 10.0)).rgb;
  color = vec4(sum / 11.0, 1.0);
}
