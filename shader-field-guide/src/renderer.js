/**
 * Dependency-free WebGL2 field-guide renderer.
 * Two geometry passes (reference / effect) → optional HDR bright pass → separable blur
 * → final compare + tone map + sRGB output. The same meshes are reused for every lesson.
 *
 * Deliberately educational: no shadow maps, no IBL, no TAA, no SSR ray marcher.
 */
const PI = Math.PI;
const NEAR = 0.1;
const FAR = 36.0;

const geometryVS = `#version 300 es
precision highp float;
layout(location=0) in vec3 a_position;
layout(location=1) in vec3 a_normal;
layout(location=2) in vec2 a_uv;
uniform mat4 u_model;
uniform mat4 u_view;
uniform mat4 u_projection;
out vec3 v_worldPosition;
out vec3 v_worldNormal;
out vec2 v_uv;
void main() {
  vec4 p = u_model * vec4(a_position, 1.0);
  v_worldPosition = p.xyz;
  v_worldNormal = normalize(mat3(u_model) * a_normal);
  v_uv = a_uv;
  gl_Position = u_projection * u_view * p;
}`;

const geometryFS = `#version 300 es
precision highp float;
in vec3 v_worldPosition;
in vec3 v_worldNormal;
in vec2 v_uv;
layout(location=0) out vec4 outScene;
layout(location=1) out vec4 outNormal;
uniform vec3 u_camera;
uniform vec3 u_baseColor; // linear sRGB
uniform float u_roughness;
uniform float u_metallic;
uniform int u_material;
uniform int u_shading;
uniform float u_time;
const float PI = 3.14159265359;

float D_GGX(float NoH, float alpha) {
  float a2 = alpha * alpha;
  float d = NoH * NoH * (a2 - 1.0) + 1.0;
  return a2 / max(PI * d * d, 1e-5);
}
float G_Schlick(float NoX, float rough) {
  float k = pow(rough + 1.0, 2.0) / 8.0;
  return NoX / (NoX * (1.0 - k) + k);
}
vec3 F_Schlick(float cosTheta, vec3 F0) {
  return F0 + (1.0 - F0) * pow(1.0 - cosTheta, 5.0);
}
vec3 lightContribution(vec3 N, vec3 V, vec3 L, vec3 radiance,
                       vec3 albedo, float rough, float metal) {
  vec3 H = normalize(V + L);
  float NoL = max(dot(N, L), 0.0);
  float NoV = max(dot(N, V), 0.0);
  float NoH = max(dot(N, H), 0.0);
  float VoH = max(dot(V, H), 0.0);
  vec3 F0 = mix(vec3(0.04), albedo, metal);
  vec3 F = F_Schlick(VoH, F0);
  float a = max(0.035, rough * rough);
  float D = D_GGX(NoH, a);
  float G = G_Schlick(NoL, rough) * G_Schlick(NoV, rough);
  vec3 specular = D * G * F / max(4.0 * NoL * NoV, 1e-4);
  vec3 diffuse = (1.0 - F) * (1.0 - metal) * albedo / PI;
  return (diffuse + specular) * radiance * NoL;
}

void main() {
  vec3 N = normalize(v_worldNormal);
  vec3 V = normalize(u_camera - v_worldPosition);
  vec3 base = u_baseColor;
  float rough = u_roughness;
  float metal = u_metallic;

  if (u_material == 2) { // floor: subtle tiled pigment + contact darkening
    vec2 f = abs(fract(v_worldPosition.xz * 0.60) - 0.5);
    float grout = smoothstep(0.47, 0.495, max(f.x, f.y));
    base *= 1.0 - 0.20 * grout;
    float dist2 = dot(v_worldPosition.xz, v_worldPosition.xz);
    base *= 1.0 - 0.19 * exp(-dist2 * 0.75);
  }
  if (u_material == 1) { // torus
    base *= vec3(1.0, 0.97, 0.85);
  }
  if (u_material == 3) { // small emissive specimen: values exceed SDR white
    outScene = vec4(base * 5.0, 1.0);
    outNormal = vec4(N * 0.5 + 0.5, 1.0);
    return;
  }
  if (u_shading == 6 && u_material == 0) {
    // Procedural, asset-free analogue of normal mapping (not a sampled map).
    float x = sin(v_uv.x * 92.0) * cos(v_uv.y * 52.0);
    float y = cos(v_uv.x * 68.0 + v_uv.y * 37.0);
    vec3 T = normalize(cross(abs(N.y) < 0.90 ? vec3(0,1,0) : vec3(1,0,0), N));
    vec3 B = normalize(cross(N, T));
    N = normalize(N + T * (0.23 * x) + B * (0.17 * y));
  }
  outNormal = vec4(N * 0.5 + 0.5, 1.0);
  if (u_shading == 5) { outScene = vec4(base, 1.0); return; }

  vec3 L = normalize(vec3(-0.58, 0.82, 0.70));
  vec3 L2 = normalize(vec3(0.70, 0.42, -0.38));
  float NoL = max(dot(N, L), 0.0);
  vec3 color;
  if (u_shading == 1) { // pure Lambert for comparison
    color = base * (0.13 + 1.9 * NoL);
  } else if (u_shading == 2) { // Blinn-Phong (not physical roughness)
    vec3 H = normalize(L + V);
    float shininess = mix(110.0, 8.0, rough);
    color = base * (0.13 + 1.8 * NoL)
          + vec3(2.2) * pow(max(dot(N, H), 0.0), shininess) * NoL;
  } else if (u_shading == 3) { // toon bands
    float band = NoL > 0.72 ? 1.4 : NoL > 0.30 ? 0.80 : 0.27;
    color = base * band + vec3(0.02, 0.024, 0.035);
  } else {
    // Educational PBR direct illumination + deliberately approximate ambient.
    color = lightContribution(N, V, L, vec3(5.1, 4.5, 4.0), base, rough, metal);
    color += lightContribution(N, V, L2, vec3(0.56, 0.89, 1.8), base, rough, metal);
    color += base * (1.0 - metal) * (0.085 + 0.11 * max(N.y, 0.0));
    color += mix(vec3(0.03), base, metal) * 0.09;
    if (u_shading == 4) { // explicitly artistic rim, not physical Fresnel
      float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
      color += rim * vec3(0.35, 1.15, 1.8);
    }
  }
  outScene = vec4(color, 1.0);
}`;

const fullscreenVS = `#version 300 es
precision highp float;
out vec2 v_uv;
void main() {
  vec2 p = vec2(gl_VertexID == 1 ? 3.0 : -1.0,
                gl_VertexID == 2 ? 3.0 : -1.0);
  v_uv = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}`;

const brightFS = `#version 300 es
precision highp float;
in vec2 v_uv;
layout(location=0) out vec4 outColor;
uniform sampler2D u_input;
void main() {
  vec3 c = texture(u_input, v_uv).rgb;
  outColor = vec4(max(c - vec3(1.15), 0.0), 1.0);
}`;

const blurFS = `#version 300 es
precision highp float;
in vec2 v_uv;
layout(location=0) out vec4 outColor;
uniform sampler2D u_input;
uniform vec2 u_step;
void main() {
  vec3 c = texture(u_input, v_uv).rgb * 0.227027;
  float w[4] = float[4](0.1945946, 0.1216216, 0.0540540, 0.0162160);
  for (int i = 1; i <= 4; ++i) {
    vec2 d = u_step * float(i);
    c += w[i-1] * (texture(u_input, v_uv+d).rgb + texture(u_input, v_uv-d).rgb);
  }
  outColor = vec4(c, 1.0);
}`;

const compositeFS = `#version 300 es
precision highp float;
in vec2 v_uv;
layout(location=0) out vec4 outColor;
uniform sampler2D u_before;
uniform sampler2D u_after;
uniform sampler2D u_normals;
uniform sampler2D u_depth;
uniform sampler2D u_bloom;
uniform float u_split;
uniform int u_post;
uniform float u_time;
uniform vec2 u_resolution;
uniform float u_fogDensity;
uniform float u_bloomStrength;
uniform float u_hdr;
const float NEAR=0.1;
const float FAR=36.0;
float linearDepth(float d) {
  float z = d * 2.0 - 1.0;
  return (2.0 * NEAR * FAR) / (FAR + NEAR - z * (FAR - NEAR));
}
vec3 srgbEncode(vec3 x) {
  x = max(x, 0.0);
  vec3 a = 1.055 * pow(x, vec3(1.0/2.4)) - 0.055;
  vec3 b = 12.92 * x;
  return vec3(x.r <= 0.0031308 ? b.r : a.r,
              x.g <= 0.0031308 ? b.g : a.g,
              x.b <= 0.0031308 ? b.b : a.b);
}
vec3 toneMap(vec3 x) {
  return clamp(x * (2.51*x + 0.03) / (x*(2.43*x + 0.59) + 0.14), 0.0, 1.0);
}
uint hash32(uint x) {
  x ^= x >> 16; x *= 0x7feb352du;
  x ^= x >> 15; x *= 0x846ca68bu;
  return x ^ (x >> 16);
}
vec3 neighbor(vec2 uv) { return texture(u_after, clamp(uv, 0.0, 1.0)).rgb; }
float outlineAmount(vec2 uv) {
  vec2 t = 1.0 / u_resolution;
  float d0 = texture(u_depth, uv).r;
  vec3 n0 = texture(u_normals, uv).xyz * 2.0 - 1.0;
  float depthEdge = 0.0, normalEdge = 0.0;
  for (int i=0; i<4; ++i) {
    vec2 stepUV = (i == 0 ? vec2(t.x,0) : i == 1 ? vec2(-t.x,0) :
                   i == 2 ? vec2(0,t.y) : vec2(0,-t.y));
    vec2 q = clamp(uv + stepUV * 1.3, 0.0, 1.0);
    float di = texture(u_depth, q).r;
    vec3 ni = texture(u_normals, q).xyz * 2.0 - 1.0;
    // Linear depth, ratio-scaled to behave across distance.
    float linear0=linearDepth(d0), linear1=linearDepth(di);
    depthEdge=max(depthEdge, abs(linear0-linear1) / max(0.8, linear0));
    normalEdge=max(normalEdge, length(ni-n0));
  }
  return clamp(smoothstep(0.018,0.055,depthEdge)
             + smoothstep(0.19,0.50,normalEdge), 0.0, 1.0);
}
void main() {
  bool before = v_uv.x < u_split;
  vec2 uv = v_uv;
  if (!before && u_post == 6) {
    vec2 size = u_resolution;
    uv = (floor(uv*size/vec2(10.0)) + 0.5) * 10.0 / size;
  }
  vec3 c = before ? texture(u_before,uv).rgb : texture(u_after,uv).rgb;
  // Debug data is not photometric color. Display encoded values directly.
  if (!before && u_post == 10) {
    outColor=vec4(texture(u_normals,v_uv).rgb,1.0); return;
  }
  if (!before && u_post == 11) {
    float d=texture(u_depth,v_uv).r;
    float gray = d > 0.99999 ? 0.02 : 1.0-clamp(linearDepth(d)/15.0,0.0,1.0);
    outColor=vec4(vec3(gray),1.0); return;
  }
  if (!before && u_post == 1) {
    float d = texture(u_depth,v_uv).r;
    if (d < 0.99999) {
      float trans = exp(-u_fogDensity * linearDepth(d));
      c = mix(vec3(0.09,0.14,0.24), c, trans);
    }
  }
  if (!before && u_post == 2) {
    c *= 1.0 - 0.92 * outlineAmount(v_uv);
  }
  if (!before && u_post == 3) {
    c += texture(u_bloom,v_uv).rgb * u_bloomStrength;
  }
  if (!before && u_post == 4) { // tiny illustrative 9-tap image blur
    vec2 p=1.8/u_resolution;
    c = neighbor(v_uv) * 0.24;
    c += (neighbor(v_uv+vec2(p.x,0))+neighbor(v_uv-vec2(p.x,0))
       +  neighbor(v_uv+vec2(0,p.y))+neighbor(v_uv-vec2(0,p.y))) * 0.12;
    c += (neighbor(v_uv+p)+neighbor(v_uv-p)
       +  neighbor(v_uv+vec2(-p.x,p.y))+neighbor(v_uv+vec2(p.x,-p.y))) * 0.07;
  }
  if (!before && u_post == 9) {
    vec2 offset = (v_uv-0.5)*0.023;
    c.r=neighbor(v_uv+offset).r;
    c.b=neighbor(v_uv-offset).b;
  }
  if (!before && u_post == 12) {
    vec2 p=1.0/u_resolution;
    c = c * 2.28 - 0.32 * (neighbor(v_uv+vec2(p.x,0))
        + neighbor(v_uv-vec2(p.x,0)) + neighbor(v_uv+vec2(0,p.y))
        + neighbor(v_uv-vec2(0,p.y)));
  }
  c = toneMap(max(c,0.0));
  if (!before && u_post == 5) { c=floor(c*6.0+0.5)/6.0; }
  if (!before && u_post == 7) {
    float l=dot(c,vec3(0.2126,0.7152,0.0722));
    c *= mix(vec3(1.16,0.98,0.87),vec3(0.83,1.02,1.19),smoothstep(0.05,0.95,l));
    c=clamp(c,0.0,1.0);
  }
  c=srgbEncode(c);
  if (!before && u_post == 8) {
    uvec2 pixel=uvec2(gl_FragCoord.xy);
    uint h=hash32(pixel.x + pixel.y*4099u + uint(floor(u_time*28.0))*104729u);
    float noise=float(h)/4294967295.0-0.5;
    c=clamp(c + vec3(noise*0.17),0.0,1.0);
  }
  outColor = vec4(c,1.0);
}`;

function compileShader(gl, kind, source) {
  const shader = gl.createShader(kind);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compilation error:\n${log}`);
  }
  return shader;
}
function program(gl, vs, fs) {
  const p = gl.createProgram();
  const a = compileShader(gl, gl.VERTEX_SHADER, vs);
  const b = compileShader(gl, gl.FRAGMENT_SHADER, fs);
  gl.attachShader(p, a); gl.attachShader(p, b);
  gl.linkProgram(p); gl.deleteShader(a); gl.deleteShader(b);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error(`Shader link error: ${gl.getProgramInfoLog(p)}`);
  }
  return p;
}
const vec3 = {
  sub: (a,b)=>a.map((v,i)=>v-b[i]),
  dot: (a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],
  cross: (a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],
  norm: a=>{ const n=Math.hypot(...a);return a.map(x=>x/n); },
};
function perspective(fov, aspect, near, far) {
  const f=1/Math.tan(fov/2);
  return new Float32Array([f/aspect,0,0,0, 0,f,0,0,
    0,0,(far+near)/(near-far),-1, 0,0,2*far*near/(near-far),0]);
}
function lookAt(eye, at) {
  const z=vec3.norm(vec3.sub(eye,at));
  const x=vec3.norm(vec3.cross([0,1,0],z));
  const y=vec3.cross(z,x);
  return new Float32Array([
    x[0],y[0],z[0],0, x[1],y[1],z[1],0, x[2],y[2],z[2],0,
    -vec3.dot(x,eye),-vec3.dot(y,eye),-vec3.dot(z,eye),1]);
}
function modelMatrix(tx=0,ty=0,tz=0, rotY=0, rotZ=0) {
  const cy=Math.cos(rotY), sy=Math.sin(rotY), cz=Math.cos(rotZ), sz=Math.sin(rotZ);
  return new Float32Array([
    cy*cz, sz, -sy*cz, 0,
    -cy*sz, cz, sy*sz, 0,
    sy, 0, cy, 0,
    tx, ty, tz, 1
  ]);
}
function mesh(gl, vertices, indices) {
  const vao=gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vbo=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
  const ebo=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ebo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(indices),gl.STATIC_DRAW);
  for (let a=0;a<3;a++) {
    const width = a===2?2:3;
    gl.enableVertexAttribArray(a);
    gl.vertexAttribPointer(a,width,gl.FLOAT,false,8*4,(a===0?0:a===1?3:6)*4);
  }
  gl.bindVertexArray(null);
  return {vao,count:indices.length};
}
function sphere(gl, radius, columns=64, rows=40) {
  const v=[], ix=[];
  for(let y=0;y<=rows;y++) for(let x=0;x<=columns;x++) {
    const theta=2*PI*x/columns, phi=PI*y/rows;
    const n=[Math.sin(phi)*Math.cos(theta),Math.cos(phi),Math.sin(phi)*Math.sin(theta)];
    v.push(n[0]*radius,n[1]*radius,n[2]*radius, ...n, x/columns, y/rows);
  }
  for(let y=0;y<rows;y++)for(let x=0;x<columns;x++) {
    const a=y*(columns+1)+x,b=a+columns+1;
    ix.push(a,a+1,b,a+1,b+1,b);
  }
  return mesh(gl,v,ix);
}
function torus(gl,major=1.45,minor=0.15,columns=96,rows=18) {
  const v=[], ix=[];
  for(let y=0;y<=rows;y++) for(let x=0;x<=columns;x++) {
    const u=2*PI*x/columns, t=2*PI*y/rows;
    const c=Math.cos(t),s=Math.sin(t),cu=Math.cos(u),su=Math.sin(u);
    const n=[c*cu,s,c*su];
    v.push((major+minor*c)*cu,minor*s,(major+minor*c)*su, ...n,x/columns,y/rows);
  }
  for(let y=0;y<rows;y++)for(let x=0;x<columns;x++) {
    const a=y*(columns+1)+x,b=a+columns+1;
    ix.push(a,b,a+1,a+1,b,b+1);
  }
  return mesh(gl,v,ix);
}
function floor(gl) {
  const s=15;
  return mesh(gl,[-s,0,-s,0,1,0,0,0, -s,0,s,0,1,0,0,1,
                   s,0,-s,0,1,0,1,0, s,0,s,0,1,0,1,1], [0,1,2,1,3,2]);
}
function box(gl,size=0.65) {
  const v=[], ix=[];
  const faces=[
    {n:[1,0,0], p:[[1,-1,-1],[1,1,-1],[1,-1,1],[1,1,1]]},
    {n:[-1,0,0],p:[[-1,-1,1],[-1,1,1],[-1,-1,-1],[-1,1,-1]]},
    {n:[0,1,0], p:[[-1,1,-1],[-1,1,1],[1,1,-1],[1,1,1]]},
    {n:[0,-1,0],p:[[-1,-1,1],[-1,-1,-1],[1,-1,1],[1,-1,-1]]},
    {n:[0,0,1], p:[[1,-1,1],[1,1,1],[-1,-1,1],[-1,1,1]]},
    {n:[0,0,-1],p:[[-1,-1,-1],[-1,1,-1],[1,-1,-1],[1,1,-1]]},
  ];
  faces.forEach(f=>{
    const a=v.length/8;
    f.p.forEach((p,i)=>v.push(...p.map(x=>x*size),...f.n,i>>1,i&1));
    ix.push(a,a+1,a+2,a+1,a+3,a+2);
  });
  return mesh(gl,v,ix);
}
function makeTexture(gl,w,h,format,type,internal,filter=gl.LINEAR) {
  const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);
  gl.texStorage2D(gl.TEXTURE_2D,1,internal,w,h);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,filter);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,filter);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D,null);
  return t;
}
function makeTarget(gl,w,h,hdr=true,geometry=false) {
  const framebuffer=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);
  const textures=[];
  const color=makeTexture(gl,w,h,gl.RGBA,hdr?gl.HALF_FLOAT:gl.UNSIGNED_BYTE,
                          hdr?gl.RGBA16F:gl.RGBA8);
  textures.push(color);
  gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,color,0);
  let depth=null, normal=null;
  if (geometry) {
    normal=makeTexture(gl,w,h,gl.RGBA,gl.UNSIGNED_BYTE,gl.RGBA8,gl.NEAREST);
    textures.push(normal);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT1,gl.TEXTURE_2D,normal,0);
    depth=makeTexture(gl,w,h,gl.DEPTH_COMPONENT,gl.UNSIGNED_INT,gl.DEPTH_COMPONENT24,gl.NEAREST);
    textures.push(depth);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,depth,0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);
  } else {gl.drawBuffers([gl.COLOR_ATTACHMENT0]);}
  const status=gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  if (status!==gl.FRAMEBUFFER_COMPLETE) throw new Error(`Framebuffer incomplete: ${status}`);
  return {framebuffer,color,normal,depth,textures,w,h};
}
const destroyTarget=(gl,t)=>{if(!t)return;for(const tex of t.textures)gl.deleteTexture(tex);gl.deleteFramebuffer(t.framebuffer);};

export function createRenderer(canvas) {
  const gl=canvas.getContext('webgl2',{antialias:true,alpha:false,depth:true,premultipliedAlpha:false});
  if (!gl) throw new Error('WebGL2 unavailable. Open this guide in a browser with WebGL2 enabled.');
  const floatColor=!!gl.getExtension('EXT_color_buffer_float');
  const pScene=program(gl,geometryVS,geometryFS);
  const pBright=program(gl,fullscreenVS,brightFS);
  const pBlur=program(gl,fullscreenVS,blurFS);
  const pCompose=program(gl,fullscreenVS,compositeFS);
  const quad=gl.createVertexArray();
  const objects=[
    {geo:floor(gl), color:[0.16,0.20,0.27],rough:0.92,metal:0.0,mat:2,position:[0,-1.12,0]},
    {geo:sphere(gl,1.02),color:[0.038,0.37,0.48],rough:.30,metal:.11,mat:0,position:[0,-.02,0]},
    {geo:torus(gl),color:[0.67,0.33,0.095],rough:.19,metal:.94,mat:1,position:[0,-.02,0]},
    {geo:sphere(gl,.43,42,26),color:[0.26,0.29,0.72],rough:.42,metal:.03,mat:5,position:[-2,-.65,-.45]},
    {geo:box(gl,.55),color:[0.44,0.38,0.21],rough:.55,metal:.58,mat:5,position:[2.04,-.55,-.45]},
    {geo:sphere(gl,.18,32,20),color:[1,.41,.11],rough:.15,metal:0.0,mat:3,position:[1.77,1.56,-.48]},
  ];
  let before,after,bright,blurA,blurB,width=0,height=0;
  let azimuth=0.72,elevation=0.36,zoom=7.1;
  let playing=false,disposed=false;
  let lesson={shader:0,beforeShader:0,post:0};
  let roughness=.30,metallic=.11,split=.5, fogDensity=.19,bloomStrength=1.55;
  let lastTime=0;
  const stats={ hdr:floatColor, drawCalls:objects.length*2,
    get resolution(){return `${width}×${height}`;},
    get gamma(){return 'sRGB / linear → tone map → sRGB';}
  };
  const locationCache=new Map();
  function ul(p,name) {
    let m=locationCache.get(p);if(!m){m=new Map();locationCache.set(p,m);}
    if(!m.has(name))m.set(name,gl.getUniformLocation(p,name));
    return m.get(name);
  }
  const ui=(p,name,val)=>gl.uniform1i(ul(p,name),val);
  const uf=(p,name,val)=>gl.uniform1f(ul(p,name),val);
  const uv2=(p,name,a,b)=>gl.uniform2f(ul(p,name),a,b);
  const uv3=(p,name,v)=>gl.uniform3fv(ul(p,name),v);
  const um4=(p,name,m)=>gl.uniformMatrix4fv(ul(p,name),false,m);
  const sampler=(p,name,unit,t)=>{
    gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,t);ui(p,name,unit);
  };
  function resize() {
    // Bound DPR for reasonable educational GPU load.
    const cssW=Math.max(350,Math.round(canvas.clientWidth));
    const cssH=Math.max(250,Math.round(canvas.clientHeight));
    const dpr=Math.min(window.devicePixelRatio||1,1.5);
    const w=Math.round(cssW*dpr/2)*2,h=Math.round(cssH*dpr/2)*2;
    if(w===width&&h===height)return;
    width=w;height=h;canvas.width=w;canvas.height=h;
    [before,after,bright,blurA,blurB].forEach(t=>destroyTarget(gl,t));
    before=makeTarget(gl,w,h,floatColor,true);
    after=makeTarget(gl,w,h,floatColor,true);
    const bw=Math.max(1,Math.floor(w/2)), bh=Math.max(1,Math.floor(h/2));
    bright=makeTarget(gl,bw,bh,floatColor);
    blurA=makeTarget(gl,bw,bh,floatColor);
    blurB=makeTarget(gl,bw,bh,floatColor);
  }
  function sceneTo(target,shading,time,eye,view,proj) {
    gl.bindFramebuffer(gl.FRAMEBUFFER,target.framebuffer);
    gl.viewport(0,0,width,height);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);
    gl.enable(gl.DEPTH_TEST);gl.depthMask(true);
    gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);
    gl.clearColor(0.033,0.050,0.083,1.0);
    gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    gl.useProgram(pScene);
    um4(pScene,'u_view',view); um4(pScene,'u_projection',proj);
    uv3(pScene,'u_camera',eye);
    ui(pScene,'u_shading',shading);uf(pScene,'u_time',time);
    objects.forEach((o,i)=>{
      let rotY = i === 2 ? -0.18 : i === 4 ? 0.55 : 0;
      let rotZ = i === 2 ? 0.59 : 0;
      const model=modelMatrix(...o.position,rotY,rotZ);
      um4(pScene,'u_model',model);
      uv3(pScene,'u_baseColor',o.color);
      uf(pScene,'u_roughness',i===1?roughness:o.rough);
      uf(pScene,'u_metallic',i===1?metallic:o.metal);
      ui(pScene,'u_material',o.mat);
      gl.bindVertexArray(o.geo.vao);gl.drawElements(gl.TRIANGLES,o.geo.count,gl.UNSIGNED_SHORT,0);
    });
    gl.bindVertexArray(null);
  }
  function quadTo(programRef,target) {
    gl.bindFramebuffer(gl.FRAMEBUFFER,target?.framebuffer??null);
    gl.viewport(0,0,target?.w??width,target?.h??height);
    gl.disable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);
    gl.useProgram(programRef);gl.bindVertexArray(quad);
  }
  function draw(time) {
    if(disposed)return;
    resize();
    // Static scene by default: before and after show identical camera poses.
    const eye=[Math.sin(azimuth)*Math.cos(elevation)*zoom,
               Math.sin(elevation)*zoom+0.52,
               Math.cos(azimuth)*Math.cos(elevation)*zoom];
    const view=lookAt(eye,[0,.0,0]);
    const proj=perspective(43*PI/180,width/height,NEAR,FAR);
    sceneTo(before,lesson.beforeShader,time,eye,view,proj);
    sceneTo(after,lesson.shader,time,eye,view,proj);
    if(lesson.post===3) {
      quadTo(pBright,bright);sampler(pBright,'u_input',0,after.color);gl.drawArrays(gl.TRIANGLES,0,3);
      quadTo(pBlur,blurA);sampler(pBlur,'u_input',0,bright.color);
      uv2(pBlur,'u_step',1/bright.w,0);gl.drawArrays(gl.TRIANGLES,0,3);
      quadTo(pBlur,blurB);sampler(pBlur,'u_input',0,blurA.color);
      uv2(pBlur,'u_step',0,1/bright.h);gl.drawArrays(gl.TRIANGLES,0,3);
    }
    quadTo(pCompose,null);
    sampler(pCompose,'u_before',0,before.color);
    sampler(pCompose,'u_after',1,after.color);
    sampler(pCompose,'u_normals',2,after.normal);
    sampler(pCompose,'u_depth',3,after.depth);
    sampler(pCompose,'u_bloom',4,blurB.color);
    uf(pCompose,'u_split',split);ui(pCompose,'u_post',lesson.post);
    uf(pCompose,'u_time',time);uv2(pCompose,'u_resolution',width,height);
    uf(pCompose,'u_fogDensity',fogDensity);
    uf(pCompose,'u_bloomStrength',bloomStrength);
    uf(pCompose,'u_hdr',floatColor?1:0);
    gl.drawArrays(gl.TRIANGLES,0,3);
    gl.bindVertexArray(null);
    const err=gl.getError();
    if(err!==gl.NO_ERROR&&window.__shaderGuideDebug)console.warn('GL error',err);
  }
  let raf;
  let dirty=true;
  function frame(t) {
    if(disposed)return;
    if(playing){lastTime=t*.001;dirty=true;}
    if(dirty){draw(lastTime);dirty=false;}
    raf=requestAnimationFrame(frame);
  }
  // Drag rotates the same geometry in both comparison halves.
  let down=false,prevX=0,prevY=0;
  canvas.addEventListener('pointerdown',e=>{down=true;prevX=e.clientX;prevY=e.clientY;canvas.setPointerCapture(e.pointerId);});
  canvas.addEventListener('pointermove',e=>{
    if(!down)return;
    azimuth-=(e.clientX-prevX)*.006;
    elevation=Math.min(1.25,Math.max(-.08,elevation+(e.clientY-prevY)*.004));
    prevX=e.clientX;prevY=e.clientY;dirty=true;
  });
  canvas.addEventListener('pointerup',()=>{down=false;});
  canvas.addEventListener('wheel',e=>{e.preventDefault();zoom=Math.min(14,Math.max(4.2,zoom+e.deltaY*.007));dirty=true;},{passive:false});
  if (typeof ResizeObserver!=='undefined') new ResizeObserver(()=>{dirty=true;}).observe(canvas);
  // GL status is exposed for inspection and screenshot tests.
  requestAnimationFrame(frame);
  return {
    stats,
    setLesson(value){lesson=value;playing=value.post===8;dirty=true;},
    setSplit(value){split=Number(value);dirty=true;},
    setRoughness(value){roughness=Number(value);dirty=true;},
    setMetallic(value){metallic=Number(value);dirty=true;},
    setFogDensity(value){fogDensity=Number(value);dirty=true;},
    setBloomStrength(value){bloomStrength=Number(value);dirty=true;},
    setPlaying(value){playing=!!value;dirty=true;},
    resetCamera(){azimuth=.72;elevation=.36;zoom=7.1;dirty=true;},
    renderOnce(){draw(lastTime);},
    dispose(){disposed=true;cancelAnimationFrame(raf);},
  };
}
