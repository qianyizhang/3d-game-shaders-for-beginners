[:arrow_backward:](screen-space-reflection.md)
[:arrow_double_up:](../README.md)
[:arrow_up_small:](#)
[:arrow_down_small:](#copyright)
[:arrow_forward:](foam.md)

# 3D Game Shaders For Beginners

## Screen Space Refraction (SSR)

<p align="center">
<img src="https://i.imgur.com/8Mdcn4y.gif" alt="Screen Space Refraction" title="Screen Space Refraction">
</p>

Screen space refraction,
much like
[screen space reflection](screen-space-reflection.md),
adds a touch of realism you can't find anywhere else.
Glass, plastic, water, and other transparent/translucent materials spring to life.

[Screen space reflection](screen-space-reflection.md)
and screen space refraction work almost identically expect for one major difference.
Instead of using the reflected vector, screen space refraction uses the
[refracted vector](http://asawicki.info/news_1301_reflect_and_refract_functions.html).
It's a slight change in code but a big difference visually.

### Vertex Positions

Like SSAO, you'll need the vertex positions in view space.
Referrer back to [SSAO](ssao.md#vertex-positions) for details.

However,
unlike SSAO,
you'll need the scene's vertex positions with and without the refractive objects.
Refractive surfaces are translucent, meaning you can see through them.
Since you can see through them, you'll need the vertex positions behind the refractive surface.
Having both the foreground and background vertex positions will allow you to calculate
UV coordinates and depth.

### Vertex Normals

To compute the refractions, you'll need the scene's foreground vertex normals in view space.
The background vertex normals aren't needed unless you need to incorporate the background surface detail
while calculating the refracted UV coordinates and distances.
Referrer back to [SSAO](ssao.md#vertex-normals) for details.

<p align="center">
<img src="https://i.imgur.com/MZ2R8I6.gif" alt="Normal maps versus no normal maps." title="Normal maps versus no normal maps.">
</p>

Here you see the water refracting the light with and without normal maps.
If available, be sure to use the normal mapped normals instead of the vertex normals.
The smoother and flatter the surface, the harder it is to tell the light is being refracted.
There will be some distortion but not enough to make it worthwhile.

To use the normal maps instead,
you'll need to transform the normal mapped normals from tangent space to view space
just like you did in the [lighting](normal-mapping.md#fragment) calculations.
The demo does this in [geometry-buffer-1.frag](../demonstration/shaders/fragment/geometry-buffer-1.frag).

### Position Transformations

<p align="center">
<img src="https://i.imgur.com/bXtXDyu.gif" alt="Position Transformations" title="Position Transformations">
</p>

Just like
[SSAO](ssao.md) and [screen space reflection](screen-space-reflection.md),
screen space refraction goes back and forth between the screen and view space.
You'll need the camera lens' projection matrix to transform points in view space to clip space.
From clip space, you'll have to transform the points again to UV space.
Once in UV space,
you can sample a vertex/fragment position from the scene
which will be the closest position in the scene to your sample.
This is the _screen space_ part in _screen space refraction_
since the "screen" is a texture UV mapped over a screen shaped rectangle.

### Refracted UV Coordinates

Recall that UV coordinates range from zero to one for both U and V.
The screen is just a 2D texture UV mapped over a screen-sized rectangle.
Knowing this, the example code doesn't actually need the final rendering of the scene
to compute the refraction.
It can instead calculate what UV coordinate each screen pixel will eventually use.
These calculated UV coordinates can be saved to a framebuffer texture
and used later when the scene has been rendered.

The process of refracting the UV coordinates is very similar to the process of
[reflecting the UV coordinates](screen-space-reflection.md#reflected-uv-coordinates).
Below are the adjustments you'll need to turn reflection into refraction.

```c
// ...

uniform sampler2D positionFromTexture;
uniform sampler2D positionToTexture;
uniform sampler2D normalFromTexture;

// ...
```

Reflection only deals with what is in front of the reflective surface.
Refraction, however, deals with what is behind the refractive surface.
To accommodate this, you'll need both the vertex positions of the scene
with the refracting surfaces taken out and the vertex positions of the scene
with the refracting surfaces left in.

<p align="center">
<img src="https://i.imgur.com/FjQtjsm.gif" alt="Without and with refractive surfaces." title="Without and with refractive surfaces.">
</p>

`positionFromTexture` are the scene's vertex positions with the refracting surfaces left in.
`positionToTexture` are the scene's vertex positions with the refracting surfaces taken out.
`normalFromTexture` are the scene's vertex normals with the refraction surfaces left in.
There's no need for the vertex normals behind the refractive surfaces unless
you want to incorporate the surface detail for the background geometry.

```c
// ...

uniform vec2 rior;

// ...
```

Refraction has one more adjustable parameter than reflection.
`rior` is the relative index of refraction or relative refractive index.
Divide the refractive index of the medium the ray leaves by the index of
the medium it enters. Air to water is about `1 / 1.33 ≈ 0.75`; water to air
is about `1.33 / 1 ≈ 1.33`.
A ratio of one leaves the ray direction unchanged.
When the ratio is greater than one, [total internal reflection](https://en.wikipedia.org/wiki/Total_internal_reflection)
can occur at sufficiently oblique angles.
GLSL's [`refract`](https://registry.khronos.org/OpenGL-Refpages/gl4/html/refract.xhtml)
returns a zero vector in that case; it does not compute a reflected ray.

The demo uses `1.05` as an artistic setting to reduce screen-space artifacts.

<p align="center">
<img src="https://i.imgur.com/dDOnobK.gif" alt="Adjusting the relative index of refraction." title="Adjusting the relative index of refraction.">
</p>

`rior` values above one tend to elongate the refraction while
numbers below one tend to shrink the refraction.

As it was with screen space reflection,
the screen doesn't have the entire geometry of the scene.
A refracted ray may march through the screen space and never hit a captured surface.
Or it may hit a surface but it's the backside not captured by the camera.
When this happened during reflection, the fragment was left blank.
This indicated no reflection or not enough information to determine a reflection.
Leaving the fragment blank was fine for reflection since the reflective surface would fill in the gaps.

<p align="center">
<img src="https://i.imgur.com/vcQDAYU.gif" alt="Refraction Holes" title="Refraction Holes">
</p>

For refraction, however, we must set the fragment to some UV.
If the fragment is left blank,
the refractive surface will contain holes that let the detail behind it come through.
This would be okay for a completely transparent surface but usually
the refractive surface will have some tint to it, reflection, etc.

```c
  // ...

  vec2 texSize  = textureSize(positionFromTexture, 0).xy;
  vec2 texCoord = gl_FragCoord.xy / texSize;

  vec4 uv = vec4(texCoord.xy, 1, 1);

  // ...
```

The best choice is to select the UV as if the `rior` was one.
This will leave the UV coordinate unchanged,
allowing the background to show through instead
of there being a hole in the refractive surface.

<p align="center">
<img src="https://i.imgur.com/9fybLUO.png" alt="Refraction UV Map" title="Refraction UV Map">
</p>

Here you see the refracted UV texture for the mill scene.
The wheel and waterway disturb what is otherwise a smooth gradient.
The disruptions shift the UV coordinates from their screen position to their refracted screen position.

```c
  // ...

  vec3 unitPositionFrom = normalize(positionFrom.xyz);
  vec3 normalFrom       = normalize(texture(normalFromTexture, texCoord).xyz);
  vec3 pivot            = normalize(refract(unitPositionFrom, normalFrom, rior.x));

  // ...
```

The most important difference is the calculation of the refracted vector versus the reflected vector.
Both use the unit position and normal but `refract` takes an additional parameter specifying the relative refractive index.

```c
    // ...

    frag      += increment;
    uv.xy      = frag / texSize;
    positionTo = texture(positionToTexture, uv.xy);

    // ...
```

The `positionTo`, sampled by the `uv` coordinates, uses the `positionToTexture`.
For reflection,
you only need one framebuffer texture containing the scene's interpolated vertex positions in view space.
However,
for refraction,
`positionToTexture` contains the vertex positions of the scene minus the refractive surfaces since
the refraction ray typically goes behind the surface.
If `positionFromTexture` and `positionToTexture` were the same for refraction,
the refracted ray would hit the refractive surface instead of what is behind it.

### Refraction Mask

<p align="center">
<img src="https://i.imgur.com/iuFYVWB.gif" alt="Material Specular" title="Material Specular">
</p>

You'll need a mask to filter out the non-refractive parts of the scene.
This mask will determine which fragment does and does not receive a refracted color.
You could use this mask during the refracted UV calculation step or later when you
actually sample the colors at the refracted UV coordinates.

In the mill demo, the geometry pass samples the material's refraction map
(`p3d_Texture4`) and writes it to the Refraction Mask buffer. The refraction
color pass reads the red channel of that buffer to decide whether to use the
refracted UV.

## Background Colors

<p align="center">
<img src="https://i.imgur.com/AmT9RrU.gif" alt="Background Colors" title="Background Colors">
</p>

You'll need to render the parts of the scene behind the refractive objects.
One way to do this is to hide the refractive objects when rendering the
background. The mill demo's refraction pass reads the Base color buffer,
where the base shader writes zero alpha for water.

### Foreground Colors

<p align="center">
<img src="https://i.imgur.com/6RPHULr.gif" alt="Foreground Colors" title="Foreground Colors">
</p>

```c
// ...

uniform sampler2D uvTexture;
uniform sampler2D maskTexture;
uniform sampler2D positionFromTexture;
uniform sampler2D positionToTexture;
uniform sampler2D backgroundColorTexture;

// ...
```

To render the actual refractions or foreground colors,
you'll need the refracted UV coordinates,
refraction mask,
the foreground and background vertex positions,
and the background colors.

```c
  // ...

  vec4  tintColor = vec4(0.392, 0.537, 0.561, 0.8);
  float depthMax  = 2.0;

  // ...
```

`tintColor` and `depthMax` are adjustable parameters.
`tintColor` colorizes the background color.
`depthMax` must be positive.
When the distance between the foreground and background position reaches `depthMax`,
the foreground color will be the fully tinted background color.
At distance zero, the foreground will be the background color.

```c
  // ...

  vec2 texSize  = textureSize(backgroundColorTexture, 0).xy;
  vec2 texCoord = gl_FragCoord.xy / texSize;

  vec4 backgroundColor = texture(backgroundColorTexture, texCoord);

  vec4 mask = texture(maskTexture, texCoord);
  if (mask.r <= 0) { fragColor = backgroundColor; return; }

  vec4 uv   = texture(uvTexture, texCoord);
  if (uv.b   <= 0) { fragColor = backgroundColor; return; }

  // ...

  vec4 positionFrom    = texture(positionFromTexture,    texCoord);
  vec4 positionTo      = texture(positionToTexture,      uv.xy);
       backgroundColor = texture(backgroundColorTexture, uv.xy);

  // ...
```

Outside the refraction mask, return the undistorted background sampled at
the original screen UV. Inside the mask, sample the foreground position at
that screen UV and the background position and color at the UV stored by
the refraction pass.

```c
  // ...

  float depth   = length(positionTo.xyz - positionFrom.xyz);
  float mixture = clamp(depth / depthMax, 0, 1);

  vec3 shallowColor    = backgroundColor.rgb;
  vec3 deepColor       = mix(shallowColor, tintColor.rgb, tintColor.a);
  vec3 foregroundColor = mix(shallowColor, deepColor,     mixture);

  // ...
```

<p align="center">
<img src="https://i.imgur.com/IEFKerB.gif" alt="Refraction Depth" title="Refraction Depth">
</p>

Calculate the depth or distance between the foreground position and the background position.
At zero depth, the foreground color will be the shallow color.
At `depthMax`, the foreground color will be the deep color.
The deep color is the background color tinted with `tintColor`.

```c
  // ...

  fragColor = mix(vec4(0.0), vec4(foregroundColor, 1.0), uv.b);

  // ...
```

The UV pass uses ray visibility to blend the original and traced UVs:
`mix(texCoord.xy, uv.xy, visibility)`. A miss has zero visibility, so the UV
stays at the original screen position. The UV pass writes blue as `1`;
it does not store the visibility there. With this buffer, the final blend
above therefore uses the full depth-tinted color for masked fragments.

### Source

- [main.cxx](../demonstration/src/main.cxx)
- [base.vert](../demonstration/shaders/vertex/base.vert)
- [basic.vert](../demonstration/shaders/vertex/basic.vert)
- [position.frag](../demonstration/shaders/fragment/position.frag)
- [normal.frag](../demonstration/shaders/fragment/normal.frag)
- [material-specular.frag](../demonstration/shaders/fragment/material-specular.frag)
- [screen-space-refraction.frag](../demonstration/shaders/fragment/screen-space-refraction.frag)
- [refraction.frag](../demonstration/shaders/fragment/refraction.frag)
- [base-combine.frag](../demonstration/shaders/fragment/base-combine.frag)

## Copyright

(C) 2019 David Lettier
<br>
[lettier.com](https://www.lettier.com)

[:arrow_backward:](screen-space-reflection.md)
[:arrow_double_up:](../README.md)
[:arrow_up_small:](#)
[:arrow_down_small:](#copyright)
[:arrow_forward:](foam.md)
