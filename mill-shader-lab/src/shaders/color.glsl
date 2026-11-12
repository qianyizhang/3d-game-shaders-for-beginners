vec3 srgb(vec3 linear) {
  vec3 x = max(linear, 0.0);
  return mix(1.055 * pow(x, vec3(1.0 / 2.4)) - 0.055, x * 12.92, lessThanEqual(x, vec3(0.0031308)));
}
vec3 linearSRGB(vec3 encoded) {
  vec3 x = max(encoded, 0.0);
  return mix(pow((x + 0.055) / 1.055, vec3(2.4)), x / 12.92, lessThanEqual(x, vec3(0.04045)));
}
