precision highp float;

uniform sampler2D normalMap;
uniform sampler2D reflectionMap;
uniform sampler2D refractionMap;
uniform sampler2D flowMap;
uniform sampler2D foamMap;
uniform float waterTime;
uniform bool ripples;

#include <lab_surface>

layout(location = 0) out vec4 waterNormal;
layout(location = 1) out vec4 waterMasks;
layout(location = 2) out vec4 flowUV;

void main() {
  vec2 flow = texture(flowMap, texUV).rg * 2.0 - 1.0;
  flow *= step(vec2(0.02), abs(flow));
  vec2 advected = texUV + flow * waterTime;
  vec3 n = ripples ? tangentNormal(texture(normalMap, advected).xyz * 2.0 - 1.0) : normalize(viewNormal);
  waterNormal = vec4(n * 0.5 + 0.5, 1.0);
  waterMasks = vec4(texture(refractionMap, texUV).r, texture(reflectionMap, texUV).r,
                    texture(foamMap, advected * 0.5).r, 1.0);
  flowUV = vec4(flow * 0.5 + 0.5, fract(advected));
}
