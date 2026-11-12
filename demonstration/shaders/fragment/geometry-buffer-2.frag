/*
  (C) 2020 David Lettier
  lettier.com
*/

#version 150


uniform sampler2D p3d_Texture0;
uniform sampler2D positionTexture;

uniform vec2 isSmoke;

in vec4 vertexPosition;
in vec4 vertexColor;

in vec2 diffuseCoord;

// Attachments in order: position, smoke mask.
out vec4 p3d_FragData[2];

void main() {
  p3d_FragData[0] = vertexPosition;
  p3d_FragData[1] = vec4(0.0);

  if (isSmoke.x == 1) {
    vec4 diffuseColor = texture(p3d_Texture0, diffuseCoord) * vertexColor;

    vec2 texSize  = textureSize(positionTexture, 0).xy;
    vec2 texCoord = gl_FragCoord.xy / texSize;

    vec4 position = texture(positionTexture, texCoord);
    if (position.a <= 0.0) {
      p3d_FragData[0] = diffuseColor.a > 0.0 ? vertexPosition : vec4(0.0);
    } else {
      p3d_FragData[0] = mix(position, vertexPosition, diffuseColor.a);
    }

    vec4 smokeMask = diffuseColor * vertexColor;
    smokeMask.rgb = vec3(dot(smokeMask.rgb, vec3(1.0 / 3.0)));
    p3d_FragData[1] = smokeMask;
  }
}
