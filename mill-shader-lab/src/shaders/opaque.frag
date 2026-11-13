precision highp float;

uniform sampler2D colorMap;
uniform sampler2D normalMap;
uniform sampler2D specularMap;
uniform sampler2D reflectionMap;
uniform bool cutout;
uniform bool deferred;
uniform bool swatch;
uniform int textureMode;
uniform int normalMode;
uniform float checkerScale;

#include <lab_surface>
#include <lab_lighting>

layout(location = 0) out vec4 albedo;
layout(location = 1) out vec4 normals;
layout(location = 2) out vec4 forwardColor;
layout(location = 3) out vec4 components;

vec2 checkerIntegral(vec2 p) {
  vec2 cycles = p * 0.5;
  return floor(cycles) + max(2.0 * fract(cycles) - 1.0, 0.0);
}

void main() {
  vec4 color = texture(colorMap, texUV);
  if (cutout && color.a < 0.45) discard;
  vec3 n = normalize(viewNormal) * (gl_FrontFacing ? 1.0 : -1.0);
  if (normalMode == 1 && !swatch) n = tangentNormal(texture(normalMap, texUV).xyz * 2.0 - 1.0);
  if (normalMode == 2) n = tangentNormal(normalize(vec3(sin(texUV.y * 100.0), cos(texUV.x * 100.0), 2.0)));
  float spec = swatch ? 1.0 : texture(specularMap, texUV).r;
  float checker = 0.0;
  if (textureMode == 0) {
    vec2 cell = texUV * checkerScale;
    vec2 width = max(fwidth(cell), vec2(0.0001));
    vec2 band = clamp((checkerIntegral(cell + width * 0.5) - checkerIntegral(cell - width * 0.5)) / width, 0.0, 1.0);
    checker = band.x + band.y - 2.0 * band.x * band.y;
  }
  vec3 base = swatch ? vec3(0.66, 0.27, 0.075) : textureMode == 0
    ? mix(vec3(0.035), vec3(0.78), checker) : color.rgb;
  albedo = vec4(base, texture(reflectionMap, texUV).r);
  normals = vec4(n * 0.5 + 0.5, spec);
  forwardColor = vec4(0.0);
  components = vec4(0.0);
  if (!deferred) {
    vec3 shine; float visibility;
    forwardColor = vec4(shade(base, n, viewPoint, spec, shine, visibility), 1.0);
    components = vec4(shine, visibility);
  }
}
