precision highp float;
in vec2 screenUV;
out vec4 color;
uniform sampler2D inputColor;
uniform vec2 axis;
uniform int mode;
uniform float radius;

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

void main() {
  vec2 px = radius / vec2(textureSize(inputColor, 0));
  vec3 c = texture(inputColor, screenUV).rgb;
  if (mode == 1) {
    c = vec3(0.0);
    for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
      c += texture(inputColor, screenUV + vec2(i, j) * px).rgb / 9.0;
    }
  }
  if (mode == 2) {
    float weights[5] = float[5](0.227027, 0.194595, 0.121622, 0.054054, 0.016216);
    c *= weights[0];
    for (int i = 1; i <= 4; ++i) {
      vec2 d = float(i) * px * axis;
      c += (texture(inputColor, screenUV + d).rgb + texture(inputColor, screenUV - d).rgb) * weights[i];
    }
  }
  if (mode == 3) {
    float bestVariance = 1e9;
    for (int q = 0; q < 4; ++q) {
      vec2 signs = vec2(q % 2 == 0 ? -1.0 : 1.0, q < 2 ? -1.0 : 1.0);
      vec3 mean = vec3(0.0);
      float moment = 0.0;
      float meanLuma = 0.0;
      for (int y = 0; y <= 3; ++y) for (int x = 0; x <= 3; ++x) {
        vec3 sampleColor = texture(inputColor, screenUV + vec2(x, y) * signs * px).rgb;
        float l = luma(sampleColor);
        mean += sampleColor / 16.0;
        meanLuma += l / 16.0;
        moment += l*l / 16.0;
      }
      float variance = moment - meanLuma*meanLuma;
      if (variance < bestVariance) { bestVariance = variance; c = mean; }
    }
  }
  color = vec4(c, 1.0);
}
