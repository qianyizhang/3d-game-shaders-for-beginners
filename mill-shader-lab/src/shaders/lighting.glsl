uniform vec3 lightDir;
uniform float daylight;
uniform mat4 inverseView;
uniform mat4 lightMatrix;
uniform sampler2D shadowMap;
uniform bool shadows;
uniform int lightingMode;
uniform float shininess;
uniform float roughness;
uniform float metalness;
uniform bool useCel;
uniform bool useRim;
uniform float nightLight;
uniform vec4 nightAnchor[3];
uniform vec3 nightColor[3];

const float PI = 3.14159265;

float shadowAt(vec3 p, vec3 n) {
  if (!shadows) return 1.0;
  vec4 clip = lightMatrix * inverseView * vec4(p, 1.0);
  vec3 q = clip.xyz / clip.w * 0.5 + 0.5;
  if (any(lessThan(q, vec3(0.0))) || any(greaterThanEqual(q, vec3(1.0)))) return 1.0;
  vec2 texel = 1.0 / vec2(textureSize(shadowMap, 0));
  float bias = mix(0.0023, 0.00065, clamp(dot(n, lightDir), 0.0, 1.0));
  float visibility = 0.0;
  for (int y = -1; y <= 1; ++y) for (int x = -1; x <= 1; ++x) {
    visibility += step(q.z - bias, texture(shadowMap, q.xy + vec2(x, y) * texel).r);
  }
  return visibility / 9.0;
}

vec3 ggx(vec3 base, float nl, float nv, float nh, float hv, float metal) {
  float alpha = max(0.04, roughness * roughness);
  float a2 = alpha * alpha;
  float denominator = nh * nh * (a2 - 1.0) + 1.0;
  float distribution = a2 / (PI * denominator * denominator);
  float k = pow(roughness + 1.0, 2.0) / 8.0;
  float geometry = (nl / mix(nl, 1.0, k)) * (nv / mix(nv, 1.0, k));
  vec3 f0 = mix(vec3(0.04), base, metal);
  vec3 fresnel = f0 + (1.0 - f0) * pow(1.0 - hv, 5.0);
  return distribution * geometry * fresnel / max(4.0 * nl * nv, 0.001);
}

vec3 shade(vec3 base, vec3 n, vec3 p, float mask, out vec3 highlight, out float visibility) {
  vec3 v = normalize(-p);
  vec3 h = normalize(lightDir + v);
  float nl = max(dot(n, lightDir), 0.0);
  float nv = max(dot(n, v), 0.001);
  float nh = max(dot(n, h), 0.0);
  float hv = max(dot(h, v), 0.0);
  float diffuse = useCel ? (nl > 0.72 ? 1.0 : nl > 0.32 ? 0.62 : nl > 0.0 ? 0.24 : 0.0) : nl;
  visibility = shadowAt(p, n);
  highlight = vec3(0.0);
  if (lightingMode == 1) highlight = vec3(pow(max(dot(reflect(-lightDir, n), v), 0.0), shininess) * mask * 0.55);
  if (lightingMode == 2) highlight = vec3(pow(nh, shininess) * mask * 0.55);
  if (lightingMode == 3) {
    highlight = ggx(base, nl, nv, nh, hv, metalness) * nl;
    vec3 f0 = mix(vec3(0.04), base, metalness);
    base *= (1.0 - (f0 + (1.0 - f0) * pow(1.0 - hv, 5.0))) * (1.0 - metalness);
  }
  highlight *= visibility * step(0.0001, nl);
  vec3 window = vec3(0.0);
  if (nightLight > 0.0) {
    vec3 world = (inverseView * vec4(p, 1.0)).xyz;
    for (int i = 0; i < 3; ++i) {
      if (nightAnchor[i].w <= 0.0) continue;
      vec3 delta = world - nightAnchor[i].xyz;
      window += nightColor[i] * exp(-dot(delta, delta) * nightAnchor[i].w);
    }
    window *= nightLight;
  }
  vec3 light = mix(vec3(0.16, 0.23, 0.39), vec3(1.0, 0.91, 0.77), daylight);
  vec3 ambient = base * mix(vec3(0.16, 0.21, 0.32), vec3(0.46, 0.48, 0.58), daylight);
  vec3 rim = useRim ? pow(1.0 - nv, 3.0) * vec3(0.12, 0.27, 0.4) : vec3(0.0);
  return ambient + (base * diffuse * visibility + highlight) * light + rim + window;
}
