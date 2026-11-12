precision highp float;
in vec2 screenUV;
layout(location = 0) out vec4 color;
layout(location = 1) out vec4 fogAmount;
layout(location = 2) out vec4 smokeMask;
uniform sampler2D inputColor;
uniform sampler2D opaqueDepth;
uniform sampler2D waterDepth;
uniform sampler2D smokeMap;
uniform mat4 viewMatrix;
uniform float daylight;
uniform int fogMode;
uniform float fogNear;
uniform float fogFar;
uniform float fogDensity;
uniform bool smoke;
uniform float time;
#include <lab_depth>

void main() {
  vec3 c = texture(inputColor, screenUV).rgb;
  float d = min(texture(opaqueDepth, screenUV).r, texture(waterDepth, screenUV).r);
  vec3 p = viewPosition(screenUV, d);
  float covered = 0.0;
  if (smoke) for (int i = 7; i >= 0; --i) {
    float seed = float(i) * 1.618;
    float age = fract(time * 0.37 + float(i) / 8.0);
    vec3 origin = vec3(0.47 + age * 0.84 + sin(seed + age) * 0.22, 8.9 + age * 3.6, -4.5 - age * 0.48);
    vec3 center = (viewMatrix * vec4(origin, 1.0)).xyz;
    if (center.z < 0.0 && center.z > p.z) {
      float width = 0.27 + age * 1.34;
      vec2 uv = (screenUV - projectUV(center)) / (vec2(projection[0][0], projection[1][1]) * width / (-2.0 * center.z)) + 0.5;
      if (inFrame(uv)) {
        vec4 sprite = texture(smokeMap, uv);
        float alpha = sprite.a * sin(age * 3.14159) * 0.47;
        c = mix(c, mix(vec3(0.21, 0.22, 0.28), vec3(0.97, 0.77, 0.56), daylight) * sprite.rgb, alpha);
        covered += alpha * (1.0 - covered);
      }
    }
  }
  float originZ = (viewMatrix * vec4(0.0, 0.0, 0.0, 1.0)).z;
  float relativeZ = originZ - p.z;
  float f = 0.0;
  if (d < 1.0 && fogMode == 1) f = clamp((relativeZ - fogNear) / max(fogFar - fogNear, 0.1), 0.0, 0.97);
  if (d < 1.0 && fogMode == 2) f = 1.0 - exp(-fogDensity * max(relativeZ - fogNear + 2.0, 0.0));
  vec3 sky = mix(vec3(0.14, 0.14, 0.25), vec3(0.82, 0.73, 0.57), daylight);
  color = vec4(mix(c, sky, f), 1.0);
  fogAmount = vec4(vec3(f), 1.0);
  smokeMask = vec4(vec3(covered), 1.0);
}
