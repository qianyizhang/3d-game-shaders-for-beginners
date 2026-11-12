precision highp float;
in vec2 screenUV;
layout(location = 0) out vec4 sceneColor;
layout(location = 1) out vec4 refracted;
layout(location = 2) out vec4 reflected;
layout(location = 3) out vec4 foamAmount;
uniform sampler2D opaqueColor;
uniform sampler2D opaqueDepth;
uniform sampler2D waterDepth;
uniform sampler2D waterNormal;
uniform sampler2D waterMasks;
uniform sampler2D refractionHit;
uniform sampler2D reflectionHit;
uniform sampler2D aoTexture;
uniform bool applyAO;
uniform bool reflectOn;
uniform bool fresnel;
uniform float foamDepth;
uniform float daylight;

#include <lab_depth>

vec3 sky() {
  vec3 night = mix(vec3(0.13, 0.095, 0.16), vec3(0.047, 0.09, 0.15), screenUV.y);
  vec3 day = mix(vec3(0.94, 0.72, 0.48), vec3(0.28, 0.51, 0.51), screenUV.y);
  return mix(night, day, daylight);
}

vec3 opaqueAt(vec2 uv, float depth) {
  if (depth >= 1.0) return sky();
  float ao = applyAO ? texture(aoTexture, uv).r : 1.0;
  return texture(opaqueColor, uv).rgb * mix(0.34, 1.0, ao);
}

void main() {
  float od = texture(opaqueDepth, screenUV).r;
  vec3 underlying = opaqueAt(screenUV, od);
  vec4 hit = texture(refractionHit, screenUV);
  vec4 mirror = texture(reflectionHit, screenUV);
  float wd = texture(waterDepth, screenUV).r;
  sceneColor = refracted = vec4(underlying, 1.0);
  reflected = foamAmount = vec4(0.0);
  if (wd >= od) return;
  vec2 lookup = hit.b > 0.5 ? hit.rg : screenUV;
  float sampleDepth = texture(opaqueDepth, lookup).r;
  vec3 water = viewPosition(screenUV, wd);
  float layer = length(viewPosition(lookup, sampleDepth) - water);
  vec3 sampled = opaqueAt(lookup, sampleDepth);
  vec3 tint = vec3(0.105, 0.24, 0.28) * mix(0.22, 1.0, daylight);
  refracted = vec4(mix(sampled, tint, clamp(layer / 2.0, 0.0, 1.0) * 0.56 * hit.a), 1.0);
  vec3 n = normalize(texture(waterNormal, screenUV).rgb * 2.0 - 1.0);
  float facing = abs(dot(normalize(-water), n));
  float reflectWeight = fresnel ? 0.04 + 0.96 * pow(1.0 - facing, 5.0) : 0.37;
  reflected = vec4(opaqueAt(mirror.rg, texture(opaqueDepth, mirror.rg).r) * mirror.b * mirror.a, mirror.b);
  vec3 color = refracted.rgb;
  if (reflectOn) {
    vec3 reflectedSample = mix(sky(), opaqueAt(mirror.rg, texture(opaqueDepth, mirror.rg).r), mirror.b);
    color = mix(color, reflectedSample, reflectWeight * mirror.a);
  }
  float contact = length(viewPosition(screenUV, od) - water);
  float foam = foamDepth > 0.0 && od < 1.0
    ? (1.0 - smoothstep(0.0, foamDepth, contact)) * texture(waterMasks, screenUV).b * 0.88 : 0.0;
  foamAmount = vec4(vec3(foam), reflectWeight);
  sceneColor = vec4(mix(color, vec3(0.63, 0.74, 0.91) * mix(0.4, 1.0, daylight), foam), 1.0);
}
