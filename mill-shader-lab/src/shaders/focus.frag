precision highp float;
in vec2 screenUV;
layout(location = 0) out vec4 color;
layout(location = 1) out vec4 mask;
uniform sampler2D inputColor;
uniform sampler2D opaqueDepth;
uniform sampler2D waterDepth;
uniform sampler2D blurred;
uniform vec2 focusUV;
uniform float aperture;
uniform float focusFallback;
uniform int mode;

#include <lab_depth>
float depthAt(vec2 uv) { return min(texture(opaqueDepth, uv).r, texture(waterDepth, uv).r); }

void main() {
  vec3 sharp = texture(inputColor, screenUV).rgb;
  float raw = depthAt(screenUV);
  float depth = -viewPosition(screenUV, raw).z;
  float picked = texture(opaqueDepth, focusUV).r;
  float focus = picked < 1.0 ? -viewPosition(focusUV, picked).z : focusFallback;
  float coc = raw < 1.0 ? smoothstep(0.28, 3.8, abs(depth - focus) * aperture) : 1.0;
  mask = vec4(vec3(coc), 1.0);
  if (mode == 0) {
    // Extend far colors behind foreground silhouettes before applying the blur.
    vec2 px = 1.0 / vec2(textureSize(inputColor, 0));
    vec3 fill = sharp;
    float farthest = depth + 0.28;
    for (int j = -2; j <= 2; ++j) for (int i = -2; i <= 2; ++i) {
      vec2 uv = screenUV + vec2(i,j) * 2.0 * px;
      float z = -viewPosition(uv, depthAt(uv)).z;
      if (z > farthest) { farthest = z; fill = texture(inputColor, uv).rgb; }
    }
    color = vec4(fill, 1.0);
  } else {
    color = vec4(mix(sharp, texture(blurred, screenUV).rgb, coc), 1.0);
  }
}
