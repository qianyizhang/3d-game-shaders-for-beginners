precision highp float;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;

in vec3 position;
in vec3 normal;
in vec2 uv;
in vec3 tangent;
in vec3 bitangent;

out vec3 viewPoint;
out vec3 viewNormal;
out vec3 viewTangent;
out vec3 viewBitangent;
out vec2 texUV;

void main() {
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  viewPoint = p.xyz;
  viewNormal = normalMatrix * normal;
  viewTangent = normalMatrix * tangent;
  viewBitangent = normalMatrix * bitangent;
  texUV = uv;
  gl_Position = projectionMatrix * p;
}
