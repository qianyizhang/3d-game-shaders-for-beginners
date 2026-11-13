(() => {
  const payloads = new Map();
  window.DCC_GEOMETRY = (slug, encoded) => payloads.set(slug, Uint8Array.from(atob(encoded), c => c.charCodeAt(0)).buffer);
  window.DCCViewer = (canvas, scenes, nodes, status) => {
    const gl = canvas.getContext("webgl2", { antialias: true });
    if (!gl) {
      status.textContent = "WebGL 2 is unavailable. Catalog links and texture previews still work.";
      return { show() {}, rotate() {}, checker() {} };
    }
    const shader = (type, src) => {
      const handle = gl.createShader(type);
      gl.shaderSource(handle, "#version 300 es\n" + src);
      gl.compileShader(handle);
      if (!gl.getShaderParameter(handle, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(handle));
      return handle;
    };
    const program = gl.createProgram();
    for (const [type, source] of [[gl.VERTEX_SHADER, `
      layout(location=0) in vec3 p;
      layout(location=1) in vec3 normal;
      layout(location=2) in vec2 uv;
      uniform vec3 center, origin;
      uniform float scale, yaw, aspect;
      out vec2 tex;
      out vec3 n;
      void main() {
        vec3 q = (p + origin - center) * scale;
        float a=cos(yaw), b=sin(yaw);
        vec3 r=vec3(a*q.x-b*q.z,q.y,b*q.x+a*q.z);
        gl_Position=vec4(r.x/aspect,.88*r.y-.475*r.z,-.25*(.475*r.y+.88*r.z),1.);
        tex=uv; n=normal;
      }`], [gl.FRAGMENT_SHADER, `
      precision highp float;
      in vec2 tex; in vec3 n;
      uniform sampler2D map;
      uniform bool checker;
      uniform bool water;
      out vec4 color;
      void main(){
        vec3 albedo = texture(map,tex).rgb;
        if(checker) {
          vec2 q=tex*4.;
          vec2 w=max(fwidth(q),vec2(.001));
          vec2 a=(q+w*.5)*.5, b=(q-w*.5)*.5;
          vec2 t=clamp((floor(a)+max(fract(a)*2.-1.,0.)-floor(b)-max(fract(b)*2.-1.,0.))/w,0.,1.);
          albedo=mix(vec3(.12),vec3(.92),t.x+t.y-2.*t.x*t.y);
        }
        float l=.58+.42*max(dot(normalize(n),normalize(vec3(.45,1.,.6))),0.);
        color=vec4(albedo*l,water&&!checker?.35:1.);
      }`]]) gl.attachShader(program, shader(type, source));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    const u = Object.fromEntries(["center", "origin", "scale", "yaw", "aspect", "map", "checker", "water"]
      .map(key => [key, gl.getUniformLocation(program, key)]));
    const vertex = gl.createBuffer(), indices = gl.createBuffer();
    const textures = new Map();
    let selected, yaw = .48, checker = false, request = 0;
    const geometryLoads = new Map();

    function load(slug) {
      if (payloads.has(slug)) return Promise.resolve(payloads.get(slug));
      if (!geometryLoads.has(slug)) {
        geometryLoads.set(slug, new Promise((resolve, reject) => {
          const script = document.createElement("script");
          script.src = scenes[slug].geometry;
          script.onload = () => payloads.has(slug) ? resolve(payloads.get(slug)) : reject(new Error("Geometry file was empty"));
          script.onerror = () => reject(new Error("Geometry file could not be read"));
          document.head.append(script);
        }));
      }
      return geometryLoads.get(slug);
    }

    function texture(key) {
      if (textures.has(key)) return textures.get(key);
      const handle = gl.createTexture();
      textures.set(key, handle);
      gl.bindTexture(gl.TEXTURE_2D, handle);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([126,149,134,255]));
      const img = new Image();
      img.onload = () => {
        gl.bindTexture(gl.TEXTURE_2D, handle);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        gl.generateMipmap(gl.TEXTURE_2D);
        queueDraw();
      };
      img.src = nodes[key].data;
      return handle;
    }

    let drawing = false;
    function queueDraw() {
      if (drawing) return;
      drawing = true;
      requestAnimationFrame(() => { drawing = false; draw(); });
    }

    function draw() {
      if (!selected) return;
      const { entry, blob } = selected;
      const parts = entry.meshParts.map(id => nodes["part/" + entry.scene + "/" + id]);
      const low = [0, 1, 2].map(i => Math.min(...parts.map(p => p.bounds[0][i])));
      const high = [0, 1, 2].map(i => Math.max(...parts.map(p => p.bounds[1][i])));
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(.063, .118, .102, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(program);
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);
      gl.uniform3fv(u.center, low.map((v, i) => (v + high[i]) * .5));
      gl.uniform1f(u.scale, 1.8 / Math.max(.001, Math.hypot(...high.map((v, i) => v - low[i]))));
      gl.uniform1f(u.yaw, yaw);
      gl.uniform1f(u.aspect, canvas.width / canvas.height);
      gl.uniform1i(u.checker, checker);
      const meshes = parts.flatMap(p => p.meshes);
      for (const water of [false, true]) {
        gl.uniform1i(u.water, water);
        if (water) {
          gl.enable(gl.BLEND);
          gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        } else gl.disable(gl.BLEND);
        for (const mesh of meshes) {
          if ((mesh.role === "water") !== water) continue;
          const [vo, vc] = mesh.vertices, [io, ic] = mesh.indices;
          gl.uniform3fv(u.origin, mesh.origin);
          const key = "texture/" + mesh.textures.color.split("/").at(-1).replace(/\.png$/, "");
          gl.bindTexture(gl.TEXTURE_2D, texture(key));
          gl.bindBuffer(gl.ARRAY_BUFFER, vertex);
          gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(blob, vo, vc), gl.STREAM_DRAW);
          for (const [loc, size, offset] of [[0,3,0],[1,3,12],[2,2,24]]) {
            gl.enableVertexAttribArray(loc);
            gl.vertexAttribPointer(loc,size,gl.FLOAT,false,56,offset);
          }
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indices);
          gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(blob, io, ic), gl.STREAM_DRAW);
          gl.drawElements(gl.TRIANGLES, ic, gl.UNSIGNED_INT, 0);
        }
      }
    }

    return {
      async show(entry) {
        const id = ++request;
        selected = undefined;
        if (!entry?.meshParts?.length) return;
        gl.clearColor(.063, .118, .102, 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        status.textContent = "Loading mesh…";
        try {
          const blob = await load(entry.scene);
          if (request !== id) return;
          selected = { entry, blob };
          draw();
          status.textContent = checker ? "UV checker on" : "Base color preview · neutral light";
        } catch (error) {
          if (request === id) status.textContent = error.message;
        }
      },
      rotate(amount) { yaw += amount; draw(); },
      checker(value) { checker = value; draw(); if (selected) status.textContent = value ? "UV checker on" : "Base color preview · neutral light"; },
    };
  };
})();
