precision highp float;
in vec2 screenUV;
uniform sampler2D depthTexture;
uniform sampler2D albedoTexture;
uniform sampler2D normalTexture;

#include <lab_depth>
#include <lab_lighting>

layout(location = 0) out vec4 litColor;
layout(location = 1) out vec4 components;

void main() {
  float depth = texture(depthTexture, screenUV).r;
  litColor = vec4(0.0); components = vec4(0.0);
  if (depth >= 1.0) return;
  vec4 normalSpec = texture(normalTexture, screenUV);
  vec3 n = normalize(normalSpec.rgb * 2.0 - 1.0);
  vec3 p = viewPosition(screenUV, depth);
  vec3 shine; float visibility;
  vec3 lit = shade(texture(albedoTexture, screenUV).rgb, n, p, normalSpec.a, shine, visibility);
  litColor = vec4(lit, 1.0);
  components = vec4(shine, visibility);
}
