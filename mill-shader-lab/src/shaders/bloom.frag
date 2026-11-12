precision highp float;
in vec2 screenUV;
out vec4 color;
uniform sampler2D inputColor;
uniform sampler2D bloomTexture;
uniform sampler2D opaqueDepth;
uniform sampler2D waterDepth;
uniform int mode;
uniform float strength;
float luma(vec3 rgb) { return dot(rgb, vec3(0.2126, 0.7152, 0.0722)); }

void main() {
  vec3 c = texture(inputColor, screenUV).rgb;
  vec2 px = 1.0 / vec2(textureSize(inputColor, 0));
  if (mode == 0) {
    c = (texture(inputColor, screenUV + px * vec2(-0.5,-0.5)).rgb
       + texture(inputColor, screenUV + px * vec2(0.5,-0.5)).rgb
       + texture(inputColor, screenUV + px * vec2(-0.5,0.5)).rgb
       + texture(inputColor, screenUV + px * vec2(0.5,0.5)).rgb) * 0.25;
    c = max(c - vec3(1.0), vec3(0.0));
  } else if (mode == 1) {
    vec3 sum = vec3(0.0);
    for (int j = -3; j <= 3; ++j) for (int i = -3; i <= 3; ++i) {
      vec2 uv = screenUV + vec2(i,j) * px * 1.7;
      if (min(texture(opaqueDepth, uv).r, texture(waterDepth, uv).r) >= 1.0) continue;
      vec3 s = texture(inputColor, uv).rgb;
      sum += s * step(0.6, luma(s)) / 49.0;
    }
    c = sum;
  } else {
    c += texture(bloomTexture, screenUV).rgb * strength;
  }
  color = vec4(c, 1.0);
}
