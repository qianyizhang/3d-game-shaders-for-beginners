precision highp float;
in vec2 screenUV;
layout(location = 0) out vec4 color;
layout(location = 1) out vec4 fogAmount;
layout(location = 2) out vec4 smokeMask;
uniform sampler2D inputColor;
uniform sampler2D opaqueDepth;
uniform sampler2D waterDepth;
uniform sampler2D smokeMap;
uniform mat4 viewMatrix;
uniform mat4 inverseView;
uniform float daylight;
uniform int fogMode;
uniform float fogNear;
uniform float fogFar;
uniform float fogDensity;
uniform int smokeMode;
uniform float time;
#include <lab_depth>

const int puffCount = 8;
const vec3 chimney = vec3(0.47, 8.9, -4.5);
const vec3 plumeDrift = vec3(0.84, 3.6, -0.48);
const float wobble = 0.22;
const float baseWidth = 0.27;
const float widthGrowth = 1.34;

struct Puff {
  vec3 center;
  float width;
  float fade;
};

// Both renderers use this same emitter, trajectory, size and lifetime.
Puff smokePuff(int i) {
  float seed = float(i) * 1.618;
  float age = fract(time * 0.37 + float(i) / float(puffCount));
  vec3 center = chimney + age * plumeDrift + vec3(sin(seed + age) * wobble, 0.0, 0.0);
  return Puff(center, baseWidth + age * widthGrowth, sin(age * 3.14159));
}

float drawSprites(inout vec3 c, vec3 p, vec3 tint) {
  float covered = 0.0;
  // Keep the texture footprint stable where neighboring pixels skip a sprite.
  vec2 screenDx = dFdx(screenUV);
  vec2 screenDy = dFdy(screenUV);
  for (int i = puffCount - 1; i >= 0; --i) {
    Puff puff = smokePuff(i);
    vec3 center = (viewMatrix * vec4(puff.center, 1.0)).xyz;
    if (center.z < 0.0 && center.z > p.z) {
      vec2 size = vec2(projection[0][0], projection[1][1]) * puff.width / (-2.0 * center.z);
      vec2 uv = (screenUV - projectUV(center)) / size + 0.5;
      if (inFrame(uv)) {
        vec4 sprite = textureGrad(smokeMap, uv, screenDx / size, screenDy / size);
        // The source texture has residual opacity at its border. Taper the
        // outer rim so the puff reaches zero before the rectangle cuts off.
        vec2 edge = min(uv, 1.0 - uv);
        float borderFade = smoothstep(0.0, 0.04, min(edge.x, edge.y));
        float alpha = sprite.a * puff.fade * 0.47 * borderFade;
        c = mix(c, tint * sprite.rgb, alpha);
        covered += alpha * (1.0 - covered);
      }
    }
  }
  return covered;
}

vec4 hashCorners(vec4 n) {
  n = fract(n * 0.1031);
  n *= n + 33.33;
  return fract(n * (n + n));
}

float noise3D(vec3 p) {
  vec3 cell = floor(p);
  vec3 f = smoothstep(vec3(0.0), vec3(1.0), fract(p));
  float key = dot(cell, vec3(1.0, 57.0, 113.0));
  vec4 corners = key + vec4(0.0, 1.0, 57.0, 58.0);
  vec4 layers = mix(hashCorners(corners), hashCorners(corners + 113.0), f.z);
  return mix(mix(layers.x, layers.y, f.x), mix(layers.z, layers.w, f.x), f.y);
}

float marchSmoke(vec3 p) {
  // Reconstruct the world ray. Intersect only the box enclosing the plume,
  // and stop at the first roof, water or other scene surface.
  vec3 rayOrigin = inverseView[3].xyz;
  vec3 rayDir = mat3(inverseView) * normalize(p);
  vec3 invDir = mix(vec3(-1.0), vec3(1.0), greaterThanEqual(rayDir, vec3(0.0)))
              / max(abs(rayDir), vec3(0.000001));
  vec3 pad = vec3((baseWidth + widthGrowth) * 0.5) + vec3(wobble, 0.0, 0.0);
  vec3 lo = (chimney + min(plumeDrift, vec3(0.0)) - pad - rayOrigin) * invDir;
  vec3 hi = (chimney + max(plumeDrift, vec3(0.0)) + pad - rayOrigin) * invDir;
  vec3 entry = min(lo, hi);
  vec3 exit = max(lo, hi);
  float start = max(max(entry.x, max(entry.y, entry.z)), length(viewPosition(screenUV, 0.0)));
  float end = min(min(exit.x, min(exit.y, exit.z)), length(p));
  if (end <= start) return 0.0;

  Puff puffs[puffCount];
  for (int i = 0; i < puffCount; ++i) puffs[i] = smokePuff(i);
  const int steps = 36;
  float stepLength = (end - start) / float(steps);
  float opticalDepth = 0.0;
  for (int stepIndex = 0; stepIndex < steps; ++stepIndex) {
    vec3 samplePos = rayOrigin + rayDir * (start + (float(stepIndex) + 0.5) * stepLength);
    float density = 0.0;
    for (int i = 0; i < puffCount; ++i) {
      vec3 offset = (samplePos - puffs[i].center) / (0.5 * puffs[i].width);
      float radiusSquared = dot(offset, offset);
      density += (1.0 - smoothstep(0.0, 1.0, radiusSquared)) * puffs[i].fade;
    }
    if (density > 0.0) {
      // Break up the puffs with a 3D pattern that drifts along with the plume.
      vec3 q = (samplePos - chimney - plumeDrift * (time * 0.37)) * 7.0;
      float billows = noise3D(q);
      density = max(0.0, density - 0.18 * (1.0 - billows)) * mix(0.65, 2.55, billows);
      opticalDepth += density * stepLength;
    }
  }
  // Constant smoke tint: combine attenuation over the ray before compositing.
  return 1.0 - exp(-opticalDepth);
}

void main() {
  vec3 c = texture(inputColor, screenUV).rgb;
  float d = min(texture(opaqueDepth, screenUV).r, texture(waterDepth, screenUV).r);
  vec3 p = viewPosition(screenUV, d);
  float covered = 0.0;
  vec3 smokeTint = mix(vec3(0.21, 0.22, 0.28), vec3(0.97, 0.77, 0.56), daylight);
  if (smokeMode == 1) {
    covered = drawSprites(c, p, smokeTint);
  } else if (smokeMode == 2) {
    covered = marchSmoke(p);
    c = mix(c, smokeTint, covered);
  }
  float originZ = (viewMatrix * vec4(0.0, 0.0, 0.0, 1.0)).z;
  float relativeZ = originZ - p.z;
  float f = 0.0;
  if (d < 1.0 && fogMode == 1) f = clamp((relativeZ - fogNear) / max(fogFar - fogNear, 0.1), 0.0, 0.97);
  if (d < 1.0 && fogMode == 2) f = 1.0 - exp(-fogDensity * max(relativeZ - fogNear + 2.0, 0.0));
  vec3 sky = mix(vec3(0.14, 0.14, 0.25), vec3(0.82, 0.73, 0.57), daylight);
  color = vec4(mix(c, sky, f), 1.0);
  fogAmount = vec4(vec3(f), 1.0);
  smokeMask = vec4(vec3(covered), 1.0);
}
