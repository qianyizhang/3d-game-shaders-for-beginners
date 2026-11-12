precision highp float;
in vec2 texUV;
uniform sampler2D colorMap;
uniform bool cutout;
out vec4 ignoredColor;
void main() {
  if (cutout && texture(colorMap, texUV).a < 0.45) discard;
  ignoredColor = vec4(1.0);
}
