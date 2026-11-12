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

#include <lab_surface>
#include <lab_lighting>

layout(location = 0) out vec4 albedo;
layout(location = 1) out vec4 normals;
layout(location = 2) out vec4 forwardColor;
layout(location = 3) out vec4 components;

void main() {
  vec4 color = texture(colorMap, texUV);
  if (cutout && color.a < 0.45) discard;
  vec3 n = normalize(viewNormal) * (gl_FrontFacing ? 1.0 : -1.0);
  if (normalMode == 1 && !swatch) n = tangentNormal(texture(normalMap, texUV).xyz * 2.0 - 1.0);
  if (normalMode == 2) n = tangentNormal(normalize(vec3(sin(texUV.y * 100.0), cos(texUV.x * 100.0), 2.0)));
  float spec = swatch ? 1.0 : texture(specularMap, texUV).r;
  float checker = mod(floor(texUV.x * 12.0) + floor(texUV.y * 12.0), 2.0);
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
