precision highp float;
in vec2 screenUV;
layout(location = 0) out vec4 color;
layout(location = 1) out vec4 displayLinear;
uniform sampler2D inputColor;
uniform sampler2D opaqueDepth;
uniform sampler2D waterDepth;
uniform sampler2D neutralLut;
uniform sampler2D dayLut;
uniform sampler2D nightLut;
uniform float daylight;
uniform bool toneMap;
uniform bool grayRamp;
uniform float levels;
uniform int posterStyle;
uniform float blockSize;
uniform bool pixelBackground;
uniform float sharpness;
uniform float grainAmount;
uniform int frame;
uniform int grade;
#include <lab_color>

vec3 lutPoint(sampler2D lut, ivec3 rgb) {
  return texelFetch(lut, ivec2(rgb.b * 16 + rgb.r, 15 - rgb.g), 0).rgb;
}

vec3 lutSample(sampler2D lut, vec3 linear) {
  vec3 q = clamp(srgb(linear), 0.0, 1.0) * 15.0;
  ivec3 p = ivec3(floor(q)), s = min(p + 1, ivec3(15));
  vec3 t = fract(q);
  vec3 a = mix(mix(lutPoint(lut, ivec3(p.x,p.y,p.z)), lutPoint(lut, ivec3(s.x,p.y,p.z)), t.x),
               mix(lutPoint(lut, ivec3(p.x,s.y,p.z)), lutPoint(lut, ivec3(s.x,s.y,p.z)), t.x), t.y);
  vec3 b = mix(mix(lutPoint(lut, ivec3(p.x,p.y,s.z)), lutPoint(lut, ivec3(s.x,p.y,s.z)), t.x),
               mix(lutPoint(lut, ivec3(p.x,s.y,s.z)), lutPoint(lut, ivec3(s.x,s.y,s.z)), t.x), t.y);
  return linearSRGB(mix(a,b,t.z));
}

uint hash(uint x) {
  x ^= x >> 16u;
  x *= 0x7feb352du;
  x ^= x >> 15u;
  x *= 0x846ca68bu;
  return x ^ (x >> 16u);
}

void main() {
  vec2 size = vec2(textureSize(inputColor, 0));
  vec2 uv = screenUV;
  if (blockSize > 1.0 && (!pixelBackground || min(texture(opaqueDepth, uv).r, texture(waterDepth, uv).r) < 1.0)) {
    uv = (floor(screenUV * size / blockSize) + 0.5) * blockSize / size;
  }
  vec3 c = texture(inputColor, uv).rgb;
  if (sharpness > 0.0) {
    vec2 px = 1.0 / size;
    vec3 neighbors = texture(inputColor, uv + vec2(px.x,0)).rgb + texture(inputColor, uv - vec2(px.x,0)).rgb
                   + texture(inputColor, uv + vec2(0,px.y)).rgb + texture(inputColor, uv - vec2(0,px.y)).rgb;
    c += (c - neighbors * 0.25) * sharpness;
  }
  if (toneMap) {
    // Extended Reinhard with a white point of four in linear scene units.
    float y = dot(max(c, 0.0), vec3(0.2126, 0.7152, 0.0722));
    c *= (1.0 + y / 16.0) / (1.0 + y);
  }
  if (grayRamp) c = vec3(screenUV.y > 0.5 ? screenUV.x : screenUV.x * 0.018);
  c = clamp(c, 0.0, 1.0);
  if (levels > 1.0) {
    if (posterStyle == 0 && min(texture(opaqueDepth, screenUV).r, texture(waterDepth, screenUV).r) < 1.0) {
      // Legacy quantizes the brightest channel, then scales the others with it.
      vec3 v = pow(c, vec3(1.0 / 2.2));
      float peak = max(v.r, max(v.g, v.b));
      float band = floor(peak * levels + 0.5) / levels;
      c = pow(v * band / max(peak, 1e-5), vec3(2.2));
    }
    if (posterStyle == 1) c = linearSRGB(floor(srgb(c) * levels + 0.5) / levels);
  }
  if (grainAmount > 0.0) {
    uint pixel = uint(gl_FragCoord.x) + uint(size.x) * uint(gl_FragCoord.y);
    float noise = float(hash(pixel ^ hash(uint(frame)))) / 4294967295.0 - 0.5;
    c = clamp(c + noise * grainAmount, 0.0, 1.0);
  }
  displayLinear = vec4(c, 1.0);
  if (grade == 1) c = lutSample(neutralLut, c);
  if (grade == 2) c = lutSample(dayLut, c);
  if (grade == 3) c = lutSample(nightLut, c);
  if (grade == 4) c = mix(lutSample(nightLut, c), lutSample(dayLut, c), daylight);
  if (grade == 5) {
    float y = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c *= mix(vec3(1.12,0.93,0.78), vec3(0.86,1.01,1.17), smoothstep(0.08,0.83,y));
  }
  color = vec4(c, 1.0);
}
