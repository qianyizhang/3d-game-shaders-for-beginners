/*
  (C) 2019 David Lettier
  lettier.com
*/

#version 150

uniform sampler2D positionTexture;
uniform sampler2D noiseTexture;
uniform sampler2D focusTexture;
uniform sampler2D outOfFocusTexture;

uniform vec2 mouseFocusPoint;
uniform vec2 nearFar;
uniform vec2 enabled;

// Attachment 0 is scene color; attachment 1 is the blur mask.
out vec4 p3d_FragData[2];

void main() {
  float minDistance =  8.0;
  float maxDistance = 12.0;

  float far  = nearFar.y;

  vec2 texSize  = textureSize(focusTexture, 0).xy;
  vec2 texCoord = gl_FragCoord.xy / texSize;

  vec4 focusColor = texture(focusTexture, texCoord);

  p3d_FragData[0] = focusColor;
  p3d_FragData[1] = vec4(0.0);

  if (enabled.x != 1) { return; }

  vec4 position = texture(positionTexture, texCoord);

  if (position.a <= 0) { p3d_FragData[1] = vec4(1.0); return; }

  vec4 outOfFocusColor = texture(outOfFocusTexture, texCoord);
  vec4 focusPoint      = texture(positionTexture,   mouseFocusPoint);

  float blur =
    smoothstep
      ( minDistance
      , maxDistance
      , length(position - focusPoint)
      );

  p3d_FragData[0] = mix(focusColor, outOfFocusColor, blur);
  p3d_FragData[1] = vec4(blur);
}
