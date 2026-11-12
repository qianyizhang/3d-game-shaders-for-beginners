precision highp float;
in vec2 screenUV;
out vec4 color;
uniform sampler2D source;
uniform int style;
uniform float targetDistance;
#include <lab_depth>

uniform int encoding;
uniform int aberration;
uniform float fringe;
uniform vec2 focusUV;
#include <lab_color>

void main() {
  vec4 data = texture(source, screenUV);
  vec3 outputColor = data.rgb;
  if (style == 0 || style == 9) {
    vec3 linear = data.rgb;
    if (style == 9 && aberration != 0) {
      vec2 delta = screenUV - (aberration == 1 ? vec2(0.5) : focusUV);
      vec2 offset = delta * length(delta) * fringe;
      linear = vec3(texture(source, screenUV + offset).r, linear.g, texture(source, screenUV - offset).b);
    }
    outputColor = style == 9 && encoding == 1 ? pow(max(linear, 0.0), vec3(1.0 / 2.2)) : srgb(linear);
  }
  if (style == 2) outputColor = vec3(data.r);
  if (style == 3) outputColor = data.a > 0.0 ? (data.b > 0.0 ? vec3(data.rg, data.b * 0.32) : vec3(0.33, 0.14, 0.12)) : vec3(0.035);
  if (style == 4) outputColor = vec3(data.a);
  if (style == 5) outputColor = vec3(data.r == 1.0 ? 0.0 : clamp(0.5 + (-viewPosition(screenUV, data.r).z - targetDistance) * 0.06, 0.0, 1.0));
  if (style == 6) outputColor = data.r == 1.0 ? vec3(0.0) : clamp((viewPosition(screenUV, data.r) + vec3(0.0, 0.0, targetDistance)) * 0.04 + 0.5, 0.0, 1.0);
  if (style == 7) outputColor = vec3(data.rg, 0.0);
  if (style == 8) outputColor = vec3(data.ba, 0.0);
  color = vec4(outputColor, 1.0);
}
