/* Neutral previews and authored rigid motion. No Lab lighting or shader effects. */
(() => {
  const payloads = new Map<string, ArrayBuffer>(),
    loads = new Map<string, Promise<ArrayBuffer>>();
  window.DCC_GEOMETRY = (slug, encoded) =>
    payloads.set(
      slug,
      Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0)).buffer,
    );
  function geometry(
    slug: string,
    scenes: DCC.CatalogData["scenes"],
  ): Promise<ArrayBuffer> {
    if (payloads.has(slug)) return Promise.resolve(payloads.get(slug)!);
    if (!loads.has(slug)) {
      const promise = new Promise<ArrayBuffer>((resolve, reject) => {
        const script = document.createElement("script");
        const timer = setTimeout(
          () => finish(new Error("Geometry load timed out")),
          15000,
        );
        function finish(error?: Error) {
          clearTimeout(timer);
          script.remove();
          if (error) reject(error);
          else if (payloads.has(slug)) resolve(payloads.get(slug)!);
          else reject(new Error("Geometry file was empty"));
        }
        const scene = scenes[slug];
        if (!scene) throw new Error(`Unknown scene ${slug}`);
        script.src = scene.geometry;
        script.onload = () => finish();
        script.onerror = () =>
          finish(new Error("Geometry file could not be read"));
        document.head.append(script);
      });
      loads.set(slug, promise);
      promise.catch(() => {
        if (loads.get(slug) === promise) loads.delete(slug);
      });
    }
    return loads.get(slug)!;
  }
  window.DCCViewer = (canvas, scenes, nodes, status) => {
    const report = (state: string, text: string) => {
      status.dataset.state = state;
      status.textContent = text;
    };
    const unavailable = (message: string): DCC.Viewer => {
      report("unavailable", message);
      return {
        async show(entry) {
          if (entry) report("unavailable", message);
          return false;
        },
        rotate() {},
        zoom() {},
        reset() {},
        checker() {},
        pose() {},
        motionInfo() {
          return null;
        },
        snapshot() {
          return null;
        },
        dispose() {},
      };
    };
    const context = canvas.getContext("webgl2", { antialias: true });
    if (!context)
      return unavailable(
        "WebGL 2 is unavailable. Catalog links and map images still work.",
      );
    const gl = context;
    const shaders: WebGLShader[] = [],
      program = gl.createProgram();
    if (!program) return unavailable("The graphics preview could not start.");
    try {
      for (const [type, source] of [
        [
          gl.VERTEX_SHADER,
          `
        layout(location=0) in vec3 p;
        layout(location=1) in vec3 normal;
        layout(location=2) in vec2 uv;
        uniform vec3 center, origin;
        uniform mat4 pose;
        uniform float scale, yaw, pitch, aspect, depth;
        out vec2 tex; out vec3 n;
        void main() {
          vec3 q=(pose*vec4(p+origin,1.)).xyz-center;
          float a=cos(yaw), b=sin(yaw), c=cos(pitch), d=sin(pitch);
          vec3 r=vec3(a*q.x-b*q.z,q.y,b*q.x+a*q.z);
          gl_Position=vec4(r.x*scale/aspect,(c*r.y-d*r.z)*scale,-depth*(d*r.y+c*r.z),1.);
          tex=uv; n=mat3(pose)*normal;
        }`,
        ],
        [
          gl.FRAGMENT_SHADER,
          `
        precision highp float;
        in vec2 tex; in vec3 n;
        uniform sampler2D map;
        uniform bool checker, water;
        out vec4 color;
        void main(){
          vec3 albedo=texture(map,tex).rgb;
          if(checker){
            vec2 q=tex*4., w=max(fwidth(q),vec2(.001));
            vec2 a=(q+w*.5)*.5, b=(q-w*.5)*.5;
            vec2 t=clamp((floor(a)+max(fract(a)*2.-1.,0.)-floor(b)-max(fract(b)*2.-1.,0.))/w,0.,1.);
            albedo=mix(vec3(.12),vec3(.92),t.x+t.y-2.*t.x*t.y);
          }
          float l=.58+.42*max(dot(normalize(n),normalize(vec3(.45,1.,.6))),0.);
          color=vec4(albedo*l,water&&!checker?.35:1.);
        }`,
        ],
      ] as const) {
        const shader = gl.createShader(type);
        if (!shader) throw new Error("Shader allocation failed");
        shaders.push(shader);
        gl.shaderSource(shader, "#version 300 es\n" + source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
          throw new Error(
            gl.getShaderInfoLog(shader) ?? "Shader compilation failed",
          );
        gl.attachShader(program, shader);
      }
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        throw new Error(gl.getProgramInfoLog(program) ?? "Program link failed");
    } catch {
      shaders.forEach((s) => gl.deleteShader(s));
      gl.deleteProgram(program);
      return unavailable(
        "The graphics preview could not start. Catalog links and map images still work.",
      );
    }
    shaders.forEach((s) => gl.deleteShader(s));
    const uniformNames = [
      "center",
      "origin",
      "pose",
      "scale",
      "yaw",
      "pitch",
      "aspect",
      "depth",
      "map",
      "checker",
      "water",
    ] as const;
    const u = Object.fromEntries(
      uniformNames.map((k) => [k, gl.getUniformLocation(program, k)]),
    ) as Record<(typeof uniformNames)[number], WebGLUniformLocation | null>;
    const textures = new Map<
      string,
      { handle: WebGLTexture; ready: Promise<void> }
    >();
    const identity = window.DCCMotion.identity();
    function releaseSelection() {
      selected?.gpu.forEach(({ vertex, indices }) => {
        gl.deleteBuffer(vertex);
        gl.deleteBuffer(indices);
      });
      selected = undefined;
    }
    type GPU = { mesh: DCC.Mesh; vertex: WebGLBuffer; indices: WebGLBuffer };
    let selected:
        | {
            entry: DCC.Asset;
            motion: DCC.Motion | null;
            gpu: GPU[];
            transforms: Map<string, DCC.Matrix>;
            parts: DCC.PartAsset[];
            blob: ArrayBuffer;
            low: DCC.Vec3;
            high: DCC.Vec3;
            center: DCC.Vec3;
          }
        | undefined,
      request = 0,
      disposed = false,
      lost = false,
      yaw = 0.48,
      pitch = 0.495,
      zoom = 1,
      checker = false;
    const resetCamera = () => {
      yaw = 0.48;
      pitch = 0.495;
      zoom = 1;
    };
    const textureKey = (mesh: DCC.Mesh) =>
      "texture/" +
      mesh.textures
        .color!.split("/")
        .at(-1)!
        .replace(/\.png$/, "");
    function texture(key: string) {
      if (textures.has(key)) return textures.get(key)!;
      const handle = gl.createTexture(),
        img = new Image();
      if (!handle) throw new Error("Texture allocation failed");
      const ready = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("A color map timed out")),
          15000,
        );
        img.onload = () => {
          clearTimeout(timer);
          if (disposed || lost) {
            resolve();
            return;
          }
          gl.bindTexture(gl.TEXTURE_2D, handle);
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
          gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            img,
          );
          gl.generateMipmap(gl.TEXTURE_2D);
          resolve();
        };
        img.onerror = () => {
          clearTimeout(timer);
          reject(new Error("A color map could not be read"));
        };
        const node = nodes[key];
        if (node?.kind !== "texture")
          throw new Error(`Unknown color map ${key}`);
        img.src = node.data;
      });
      const entry = { handle, ready };
      textures.set(key, entry);
      ready.catch(() => {
        if (textures.get(key) === entry) textures.delete(key);
        gl.deleteTexture(handle);
      });
      return entry;
    }
    function clear() {
      if (disposed || lost) return;
      gl.depthMask(true);
      gl.clearColor(0.063, 0.118, 0.102, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    }
    function draw() {
      if (!selected || disposed || lost) return;
      const { low, high, center } = selected;
      const aspect = canvas.width / canvas.height;
      // Fit the projected bounds; a long fish and a tall building get equal margins.
      const corners = Array.from(
        { length: 8 },
        (_, mask) =>
          ([0, 1, 2] as const).map(
            (axis) =>
              ((mask >> axis) & 1 ? high[axis] : low[axis]) - center[axis],
          ) as DCC.Vec3,
      );
      const projected = corners.map(([x, y, z]) => {
        const rx = Math.cos(yaw) * x - Math.sin(yaw) * z,
          rz = Math.sin(yaw) * x + Math.cos(yaw) * z;
        return [rx, Math.cos(pitch) * y - Math.sin(pitch) * rz];
      });
      const span = [0, 1].map(
        (i) =>
          Math.max(...projected.map((p) => p[i]!)) -
          Math.min(...projected.map((p) => p[i]!)),
      );
      const scale =
        (zoom * 1.75) / Math.max(0.001, span[0]! / aspect, span[1]!);
      gl.viewport(0, 0, canvas.width, canvas.height);
      clear();
      gl.useProgram(program);
      gl.enable(gl.DEPTH_TEST);
      gl.uniform3fv(u.center, center);
      gl.uniform1f(u.scale, scale);
      gl.uniform1f(
        u.depth,
        0.8 / Math.max(0.001, Math.hypot(...high.map((v, i) => v - low[i]!))),
      );
      gl.uniform1f(u.yaw, yaw);
      gl.uniform1f(u.pitch, pitch);
      gl.uniform1f(u.aspect, aspect);
      gl.uniform1i(u.checker, Number(checker));
      const meshes = selected.gpu;
      for (const water of [false, true]) {
        gl.uniform1i(u.water, Number(water));
        if (water) {
          gl.enable(gl.BLEND);
          gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        } else gl.disable(gl.BLEND);
        for (const { mesh, vertex, indices } of meshes) {
          if ((mesh.role === "water") !== water) continue;
          const [, ic] = mesh.indices;
          gl.uniform3fv(u.origin, mesh.origin);
          gl.uniformMatrix4fv(
            u.pose,
            false,
            selected.transforms.get(mesh.part) ?? identity,
          );
          gl.bindTexture(gl.TEXTURE_2D, textures.get(textureKey(mesh))!.handle);
          gl.bindBuffer(gl.ARRAY_BUFFER, vertex);

          for (const [loc, size, offset] of [
            [0, 3, 0],
            [1, 3, 12],
            [2, 2, 24],
          ] as const) {
            gl.enableVertexAttribArray(loc);
            gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 56, offset);
          }
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indices);

          gl.drawElements(gl.TRIANGLES, ic, gl.UNSIGNED_INT, 0);
        }
      }
    }
    const lostContext = (event: Event) => {
      event.preventDefault();
      lost = true;
      ++request;
      releaseSelection();
      report(
        "unavailable",
        "Graphics context was lost. Reload the gallery to restore previews.",
      );
    };
    canvas.addEventListener("webglcontextlost", lostContext);
    return {
      async show(entry) {
        const id = ++request;
        releaseSelection();
        clear();
        if (
          !entry ||
          (entry.kind !== "scene" &&
            entry.kind !== "object" &&
            entry.kind !== "part") ||
          !entry.meshParts.length
        ) {
          report("idle", "");
          return false;
        }
        if (disposed || lost) {
          report(
            "unavailable",
            "Graphics preview is unavailable. Reload the gallery.",
          );
          return false;
        }
        resetCamera();
        report("loading", "Loading neutral preview…");
        try {
          const blob = await geometry(entry.scene, scenes);
          if (request !== id) return false;
          const parts = entry.meshParts.map((key) => {
            const part = nodes[`part/${entry.scene}/${key}`];
            if (part?.kind !== "part")
              throw new Error(`Unknown mesh part ${key}`);
            return part;
          });
          await Promise.all(
            [...new Set(parts.flatMap((p) => p.meshes.map(textureKey)))].map(
              (key) => texture(key).ready,
            ),
          );
          if (request !== id || disposed || lost) return false;
          let low = ([0, 1, 2] as const).map((i) =>
              Math.min(...parts.map((p) => p.bounds[0][i])),
            ) as DCC.Vec3,
            high = ([0, 1, 2] as const).map((i) =>
              Math.max(...parts.map((p) => p.bounds[1][i])),
            ) as DCC.Vec3;
          const rig =
            entry.kind === "object" &&
            (scenes[entry.scene]?.rigs ?? []).find(
              (r) => r.name === entry.rig && r.clips?.length,
            );
          const motion = rig
            ? window.DCCMotion.create(rig, entry.meshParts)
            : null;
          if (motion) [low, high] = motion.bounds(parts);
          const gpu: GPU[] = parts
            .flatMap((p) => p.meshes)
            .map((mesh) => {
              const vertex = gl.createBuffer(),
                indices = gl.createBuffer();
              if (!vertex || !indices)
                throw new Error("Mesh buffer allocation failed");
              gl.bindBuffer(gl.ARRAY_BUFFER, vertex);
              gl.bufferData(
                gl.ARRAY_BUFFER,
                new Float32Array(blob, ...mesh.vertices),
                gl.STATIC_DRAW,
              );
              gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indices);
              gl.bufferData(
                gl.ELEMENT_ARRAY_BUFFER,
                new Uint32Array(blob, ...mesh.indices),
                gl.STATIC_DRAW,
              );
              return { mesh, vertex, indices };
            });
          selected = {
            entry,
            motion,
            gpu,
            transforms: new Map(),
            parts,
            blob,
            low,
            high,
            center: low.map((v, i) => (v + high[i]!) * 0.5) as DCC.Vec3,
          };
          draw();
          report(
            "ready",
            checker ? "UV checker on" : "Base color preview · neutral light",
          );
          return true;
        } catch (error) {
          if (request === id) {
            releaseSelection();
            clear();
            report(
              "error",
              `${error instanceof Error ? error.message : String(error)}. Retry the preview; if a file is missing, rebuild or restore the catalog.`,
            );
          }
          return false;
        }
      },
      rotate(x, y = 0) {
        yaw += x;
        pitch = Math.max(-1.3, Math.min(1.3, pitch + y));
        draw();
      },
      zoom(factor) {
        zoom = Math.max(0.5, Math.min(3, zoom * factor));
        draw();
      },
      reset() {
        resetCamera();
        draw();
      },
      checker(value) {
        checker = value;
        draw();
        if (selected)
          report(
            "ready",
            value ? "UV checker on" : "Base color preview · neutral light",
          );
      },
      motionInfo() {
        return selected?.motion ?? null;
      },
      pose(clip = "", seconds = 0, manual = {}) {
        if (!selected?.motion || lost || disposed) return;
        selected.transforms = selected.motion.transforms(clip, seconds, manual);
        draw();
      },
      snapshot() {
        if (!selected || lost || disposed) return null;
        draw();
        return canvas.toDataURL("image/png");
      },
      dispose() {
        disposed = true;
        ++request;
        releaseSelection();
        canvas.removeEventListener("webglcontextlost", lostContext);
        textures.forEach((t) => gl.deleteTexture(t.handle));
        textures.clear();
        gl.deleteProgram(program);
      },
    };
  };
})();
