precision highp float;
in vec3 position;
out vec2 screenUV;
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
  screenUV = position.xy * 0.5 + 0.5;
}
