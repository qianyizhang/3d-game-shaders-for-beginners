import {
  DoubleSide, DynamicDrawUsage, Group, MathUtils, Matrix4, Mesh, OrthographicCamera, PerspectiveCamera, SphereGeometry, Raycaster, Scene,
  Vector2, Vector3, Vector4, type Texture, type RawShaderMaterial,
} from "three";
import { Post, isPostBuffer, postBuffers } from "./post";
import type { MeshAsset, SceneAssets } from "./assets";
import { GPU, material, source, u, type Uniforms } from "./gpu";
import { LabState, legacy } from "./state";
import vertex from "./shaders/geometry.vert?raw";
import opaque from "./shaders/opaque.frag?raw";
import water from "./shaders/water-geometry.frag?raw";
import refraction from "./shaders/refraction.frag?raw";
import composite from "./shaders/water-composite.frag?raw";
import display from "./shaders/display.frag?raw";
import shadow from "./shaders/shadow.frag?raw";
import deferred from "./shaders/deferred.frag?raw";
import reflection from "./shaders/reflection.frag?raw";
import ssao from "./shaders/ssao.frag?raw";
import aoFilter from "./shaders/ao-filter.frag?raw";
import screen from "./shaders/screen.vert?raw";

export const defaultEdit = "1.0";
export const buffers = {
  ...postBuffers,
  "Final color": ["Display output", "Screen", "The final image, with the selected display curve applied once."],
  "Opaque color": ["Forward or deferred opaque lighting", "Water composite", "Lit opaque scene, with no water drawn into it."],
  "Albedo": ["Opaque geometry", "Material inspection", "Sampled color map before lighting."],
  "Encoded normals": ["Opaque geometry", "Geometry inspection", "View-space direction packed from −1…1 into RGB."],
  "Raw depth": ["Opaque depth attachment", "Water ray search", "Hardware depth concentrates precision near the camera."],
  "Linear depth": ["Opaque depth attachment", "View-space reconstruction", "A linear remap of reconstructed camera distance."],
  "View position": ["Opaque depth attachment", "Water ray search", "View-space XYZ reconstructed from depth; displayed relative to the target plane."],
  "Water mask": ["Water geometry + depth test", "Water composite", "Only water in front of opaque geometry is eligible."],
  "Refraction hit UV": ["Refraction ray search", "Water composite", "Red and green encode hit U and V. Rust marks a miss; the composite uses the original UV."],
  "Refracted color": ["Water composite", "Display output", "The sampled opaque image with water tint. Misses keep the undistorted sample."],
  "Shadow map": ["Light-space geometry", "Opaque lighting", "Depth seen by the sun or moon. The light cannot reach a fragment behind this stored depth."],
  "Shadow visibility": ["Opaque lighting", "Opaque color", "White receives direct light; dark areas are blocked in the light's view."],
  "Specular": ["Opaque lighting", "Opaque color", "Only the direct highlight contribution."],
  "Forward color": ["Opaque geometry lighting", "Water composite", "Lighting evaluated on visible mesh fragments in the geometry pass."],
  "Deferred color": ["Fullscreen lighting", "Water composite", "Lighting evaluated from G-buffer color, normals, specular mask and reconstructed view position."],
  "SSAO raw": ["SSAO hemisphere samples", "Bilateral AO filter", "Lower visibility marks nearby depth blockers in the hemisphere around the normal."],
  "SSAO filtered": ["Bilateral AO filter", "Water composite", "Smoothed occlusion that avoids mixing distant surfaces across a depth edge."],
  "Reflection mask": ["Water geometry + depth test", "Water composite", "Visible reflection coverage from the authored material mask."],
  "Reflection hit UV": ["Reflection ray search", "Water composite", "Hit UV in red/green; blue tracks visibility near the frame edge; rust marks a miss."],
  "Fresnel weight": ["Water composite", "Scene color", "The blend weight for reflected light. With Fresnel on, grazing views are brighter."],
  "Reflection color": ["Water composite", "Scene color", "Visible reflected opaque color. Missing rays fall back to sky in the composite."],
  "Foam": ["Water composite", "Scene color", "Pattern weighted by the depth gap between water and geometry."],
  "Flow direction": ["Water geometry", "Water normals", "Red and green encode the signed texture-space flow vector."],
  "Flow UV": ["Water geometry", "Water normals", "Red and green display the moving fractional UV, as used to sample the normal texture."],
  "Water depth": ["Water depth attachment", "Water ray search", "Depth of the closest water surface before testing opaque visibility."],
  "Water normals": ["Water geometry", "Refraction ray search", "Tangent-space ripples transformed into view space."],
} as const;
export type BufferName = keyof typeof buffers;

type Part = { asset: MeshAsset; mesh: Mesh; shader: RawShaderMaterial; shadow: RawShaderMaterial; previousFrame: Float32Array | undefined };
type RevoluteJoint = { node: Group; axis: Vector3; amplitude: number; phase: number; speed: number; rest: number };

export class MillLab {
  readonly state: LabState;
  readonly camera = new PerspectiveCamera();
  readonly gpu: GPU;
  readonly name: string;
  private readonly scene = new Scene();
  private readonly waterScene = new Scene();
  private readonly parts: Part[];
  private readonly joints: RevoluteJoint[];
  private readonly swatch?: Mesh;
  private readonly lightCamera = new OrthographicCamera(-13, 13, 13, -13, 1, 58);
  private readonly shadowTarget;
  private readonly deferredTarget;
  private readonly reflectionTarget;
  private readonly aoRaw;
  private readonly aoSmooth;
  private readonly deferredPass;
  private readonly reflectionPass;
  private readonly aoPass;
  private readonly aoFilterPass;
  private readonly lightMatrix = new Matrix4();
  private readonly lightingUniforms: Uniforms;
  private readonly aoRadius = u(0.6);
  private readonly surfaceControls = { deferred: u(false), textureMode: u(1), normalMode: u(1), ripples: u(true) };
  private readonly raycaster = new Raycaster();
  private readonly opaqueTarget;
  private readonly waterTarget;
  private readonly hitTarget;
  private readonly compositeTarget;
  private readonly daylight = u(1);
  private readonly lightDir = u(new Vector3());
  private readonly waterTime = u(1);
  private readonly depthUniforms = { projection: u(this.camera.projectionMatrix), inverseProjection: u(this.camera.projectionMatrixInverse) };
  private readonly relativeIndex = u(legacy.rior);
  private readonly refractionOn = u(true);
  private readonly refractionA;
  private refractionB;
  private readonly refractionUniforms;
  private readonly displayPass;
  private readonly compositePass;
  private readonly eye = new Vector3();
  private readonly priorCamera = new PerspectiveCamera();
  private readonly previousViewProjection = new Matrix4();
  private readonly post: Post;
  private readonly focusUV = new Vector2();
  private readonly audio: HTMLAudioElement[];
  private buffer: BufferName = "Final color";
  private expression = defaultEdit;
  private audioRequest = 0;

  constructor(canvas: HTMLCanvasElement, assets: SceneAssets, gpu: GPU) {
    this.name = assets.name;
    this.state = new LabState(assets.waterline, assets.practice);
    this.gpu = gpu;
    this.audio = assets.audio.map(src => {
      const player = new Audio(src);
      player.loop = true;
      player.volume = 0.28;
      return player;
    });
    this.shadowTarget = gpu.target("Light-space depth", { depth: true });
    this.opaqueTarget = gpu.target("Opaque", { count: 4, depth: true, floating: true });
    this.deferredTarget = gpu.target("Deferred", { count: 2, floating: true });
    this.aoRaw = gpu.target("AO raw", { scale: 0.5 });
    this.aoSmooth = gpu.target("AO filtered", { scale: 0.5 });
    this.reflectionTarget = gpu.target("Reflection hit UV", { floating: true });
    this.waterTarget = gpu.target("Water geometry", { count: 3, depth: true });
    this.hitTarget = gpu.target("Refraction hit UV", { floating: true });
    this.compositeTarget = gpu.target("Water composite", { count: 4, floating: true });
    const nightLights = assets.nightLights ?? ([[1.5, 7.9, -2.49], [3.5, 7.9, -2.49], [3.5, 4.5, -1.49]] as const)
      .map(center => ({ center, falloff: 5.5, color: [3.5, 1.55, 0.43] as const }));
    const anchors = [0, 1, 2].map(i => nightLights[i]);
    this.lightingUniforms = {
      inverseView: u(this.camera.matrixWorld), lightMatrix: u(this.lightMatrix),
      shadowMap: u(this.shadowTarget.depthTexture), lightDir: this.lightDir, daylight: this.daylight,
      shadows: u(false), lightingMode: u(2), shininess: u(35), roughness: u(0.34), metalness: u(0),
      useCel: u(false), useRim: u(false), nightLight: u(0),
      nightAnchor: u(anchors.map(light => light ? new Vector4(...light.center, light.falloff) : new Vector4(0, 0, 0, 0))),
      nightColor: u(anchors.map(light => light ? new Vector3(...light.color) : new Vector3())),
    };
    this.parts = assets.meshes.map(asset => {
      const maps = asset.maps;
      const isWater = asset.role === "water";
      const shader = material(vertex, isWater ? water : opaque, {
        colorMap: u(maps.color), normalMap: u(maps.normal), specularMap: u(maps.specular),
        reflectionMap: u(maps.reflection), refractionMap: u(maps.refraction), cutout: u(asset.cutout),
        ...this.lightingUniforms, ...this.surfaceControls, swatch: u(false), checkerScale: u(assets.practice ? 4 : 12),
        flowMap: u(assets.textures.flow), foamMap: u(assets.textures.foam), waterTime: this.waterTime,
      }, { side: isWater || asset.cutout ? DoubleSide : undefined });
      const mesh = new Mesh(asset.geometry, shader);
      mesh.name = asset.part ?? asset.role;
      mesh.position.fromArray(asset.origin);
      if (Object.keys(asset.clips).length) {
        asset.attributes.setUsage(DynamicDrawUsage);
        mesh.frustumCulled = false;
      }
      (isWater ? this.waterScene : this.scene).add(mesh);
      const caster = material(vertex, shadow, { colorMap: u(maps.color), cutout: u(asset.cutout) }, { side: shader.side });
      return { asset, mesh, shader, shadow: caster, previousFrame: undefined };
    });
    this.joints = this.attachRigs(assets.rigs);
    const swatchAnchor = assets.practice?.swatch;
    const base = this.parts.find(part => part.asset.role === (swatchAnchor ? "opaque" : "mill"));
    if (base) {
      const swatch = base.shader.clone();
      // Clone shader source but share the current frame uniforms.
      swatch.uniforms = { ...base.shader.uniforms, swatch: u(true), cutout: u(false) };
      this.swatch = new Mesh(new SphereGeometry(swatchAnchor?.radius ?? 0.66, 48, 32), swatch);
      this.swatch.name = "material swatch";
      this.swatch.position.fromArray(swatchAnchor?.center ?? [0.18, 5.9, -0.15]);
      this.swatch.visible = false;
      this.scene.add(this.swatch);
    }

    const geometryInputs = {
      ...this.depthUniforms, depthTexture: u(this.opaqueTarget.depthTexture),
      normalTexture: u(this.opaqueTarget.textures[1]), albedoTexture: u(this.opaqueTarget.textures[0]),
    };
    this.deferredPass = gpu.pass(deferred, { ...geometryInputs, ...this.lightingUniforms });
    this.aoPass = gpu.pass(ssao, { ...geometryInputs, radius: this.aoRadius });
    this.aoFilterPass = gpu.pass(aoFilter, { ...geometryInputs, rawAO: u(this.aoRaw.texture) });
    this.refractionUniforms = {
      ...this.depthUniforms, opaqueDepth: u(this.opaqueTarget.depthTexture),
      waterDepth: u(this.waterTarget.depthTexture), waterNormal: u(this.waterTarget.textures[0]),
      waterMasks: u(this.waterTarget.textures[1]), relativeIndex: this.relativeIndex, enabled: this.refractionOn,
    };
    this.refractionA = gpu.pass(this.refractionSource(defaultEdit), this.refractionUniforms);
    this.refractionB = this.refractionA;
    this.reflectionPass = gpu.pass(reflection, { ...this.refractionUniforms, enabled: u(false) });
    this.compositePass = gpu.pass(composite, {
      ...this.depthUniforms, opaqueColor: u(this.opaqueTarget.textures[2]),
      opaqueDepth: u(this.opaqueTarget.depthTexture), waterDepth: u(this.waterTarget.depthTexture),
      refractionHit: u(this.hitTarget.texture), reflectionHit: u(this.reflectionTarget.texture),
      daylight: this.daylight, waterNormal: u(this.waterTarget.textures[0]), waterMasks: u(this.waterTarget.textures[1]),
      aoTexture: u(this.aoSmooth.texture), applyAO: u(false), reflectOn: u(false), fresnel: u(false), foamDepth: u(0),
    });
    this.displayPass = gpu.pass(display, {
      ...this.depthUniforms, source: u(this.compositeTarget.texture), style: u(0), targetDistance: u(1), encoding: u(0), aberration: u(0), fringe: u(0), focusUV: u(this.focusUV),
    });
    this.post = new Post(gpu, this.camera, assets, this.opaqueTarget.depthTexture!,
      this.waterTarget.depthTexture!, this.opaqueTarget.textures[1]!, this.waterTarget.textures[0]!, this.previousViewProjection);
    canvas.addEventListener("webglcontextlost", event => event.preventDefault());
  }

  private refractionSource(expression: string) {
    return refraction.replace("EDIT_BEND", () => `(${expression})`);
  }

  edit(expression: string) {
    // Restrict this to one expression so the lesson cannot install a runaway loop.
    if (!expression.trim() || expression.length > 140 || /[;{}#\n]/.test(expression) || /\/\*|\/\//.test(expression)) {
      throw new Error("Enter one GLSL float expression (up to 140 characters).");
    }
    const fragment = this.refractionSource(expression);
    this.gpu.validate(fragment);
    const prior = this.refractionB;
    this.refractionB = this.gpu.pass(fragment, this.refractionUniforms);
    this.expression = expression;
    if (prior !== this.refractionA) prior.dispose();
  }

  resetEdit() {
    if (this.refractionB !== this.refractionA) this.refractionB.dispose();
    this.refractionB = this.refractionA;
    this.expression = defaultEdit;
  }

  selectBuffer(value: BufferName) { this.buffer = value; }

  code(): { vertex: string; fragment: string } {
    if (isPostBuffer(this.buffer)) {
      return { vertex: screen, fragment: source(this.post.view(this.buffer, this.state.activeEffects()).fragment) };
    }
    switch (this.buffer) {
      case "Refraction hit UV": case "Water mask":
        return { vertex: screen, fragment: source(this.refractionSource(this.state.side === "A" ? defaultEdit : this.expression)) };
      case "Deferred color": return { vertex: screen, fragment: source(deferred) };
      case "Opaque color": case "Specular": case "Shadow visibility":
        return this.state.activeEffects().deferred
          ? { vertex: screen, fragment: source(deferred) } : { vertex, fragment: source(opaque) };
      case "Shadow map": return { vertex, fragment: shadow };
      case "SSAO raw": return { vertex: screen, fragment: source(ssao) };
      case "SSAO filtered": return { vertex: screen, fragment: source(aoFilter) };
      case "Reflection mask": case "Reflection hit UV": return { vertex: screen, fragment: source(reflection) };
      case "Fresnel weight": case "Reflection color": case "Foam": return { vertex: screen, fragment: source(composite) };
      case "Flow direction": case "Flow UV": case "Water depth":
      case "Water normals": return { vertex, fragment: source(water) };
      case "Refracted color": return { vertex: screen, fragment: source(composite) };
      case "Final color": return { vertex: screen, fragment: source(display) };
      default: return { vertex, fragment: source(opaque) };
    }
  }

  private attachRigs(rigs: SceneAssets["rigs"]): RevoluteJoint[] {
    if (!rigs?.length) return [];
    const meshes = new Map<string, Mesh[]>();
    for (const { asset, mesh } of this.parts) {
      if (asset.role !== "opaque" || !asset.part) continue;
      const group = meshes.get(asset.part);
      if (group) group.push(mesh);
      else meshes.set(asset.part, [mesh]);
    }
    return rigs.flatMap(rig => {
      const joints = new Map<string, { node: Group; pivot: Vector3 }>();
      return rig.joints.map(({ id, parent, pivot, axis, amplitude, phase, speed, parts }) => {
        const node = new Group();
        node.name = id;
        const worldPivot = new Vector3().fromArray(pivot);
        const ancestor = parent === undefined ? undefined : joints.get(parent);
        node.position.copy(worldPivot);
        if (ancestor) {
          node.position.sub(ancestor.pivot);
          ancestor.node.add(node);
        } else {
          this.scene.add(node);
        }
        // Exported pivots and mesh origins are in rest-world space. Move only
        // the local origin so the authored pose survives reparenting.
        for (const part of parts) {
          for (const mesh of meshes.get(part) ?? []) {
            mesh.position.sub(worldPivot);
            node.add(mesh);
          }
        }
        joints.set(id, { node, pivot: worldPivot });
        return { node, axis: new Vector3().fromArray(axis).normalize(), amplitude, phase, speed, rest: Math.sin(phase) };
      });
    });
  }

  private updateParts() {
    const time = this.state.propsTime;
    for (const part of this.parts) {
      const { mesh, asset } = part;
      if (asset.role === "wheel") mesh.rotation.x = -Math.PI / 2 * this.state.wheelTime;
      const clip = asset.clips[asset.role === "shutters" ? "open-shutters" : asset.role === "vane" ? "weather-vane-shake" : "banner-swing"];
      if (!clip) continue;
      const last = clip.frames.length - 1;
      const index = asset.role === "shutters"
        ? Math.round(last * Math.max(0, Math.sin(MathUtils.degToRad(this.state.shutterSun))))
        : Math.floor(time * clip.fps) % clip.frames.length;
      const frame = clip.frames[index];
      if (!frame || frame === part.previousFrame) continue;
      asset.attributes.array.set(frame);
      asset.attributes.needsUpdate = true;
      asset.geometry.boundingSphere = null;
      asset.geometry.boundingBox = null;
      part.previousFrame = frame;
    }
    for (const [index, { node, axis, amplitude, phase, speed, rest }] of this.joints.entries()) {
      const animated = (Math.sin((time - 1) * speed + phase) - rest) * amplitude;
      node.quaternion.setFromAxisAngle(axis, animated + MathUtils.degToRad(this.state.jointOffset(index)));
    }
  }

  render(width: number, height: number) {
    const { state, camera, gpu } = this;
    const fx = state.activeEffects();
    const size = Math.min(1, 1200 / width);
    gpu.resize(Math.max(2, Math.round(width * size)), Math.max(2, Math.round(height * size)));
    const pose = state.pose();
    camera.fov = pose.fov;
    camera.near = pose.near;
    camera.far = pose.far;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    const orbit = state.orbit.clone();
    orbit.theta += state.sweepFrame !== null ? state.sweepFrame * 0.008 : state.sweepOffset;
    this.eye.setFromSpherical(orbit).add(state.target);
    camera.position.copy(this.eye);
    camera.lookAt(state.target);
    camera.updateMatrixWorld();
    this.priorCamera.projectionMatrix.copy(camera.projectionMatrix);
    if (state.sweepFrame !== null && state.sweepFrame > 0) orbit.theta -= 0.008;
    this.priorCamera.position.setFromSpherical(orbit).add(state.target);
    this.priorCamera.lookAt(state.target);
    this.priorCamera.updateMatrixWorld();
    this.previousViewProjection.multiplyMatrices(this.priorCamera.projectionMatrix, this.priorCamera.matrixWorldInverse);
    this.displayPass.uniforms.targetDistance!.value = state.orbit.radius;

    const angle = MathUtils.degToRad(state.sun);
    const daylight = Math.max(0, -Math.sin(angle));
    this.daylight.value = daylight;
    this.lightingUniforms.nightLight!.value = Math.pow(Math.max(0, Math.sin(angle)), 0.4);
    const horizontal = Math.cos(angle) * (Math.sin(angle) > 0 ? -0.70710678 : 0.70710678);
    const towardLight = this.lightDir.value.set(horizontal, Math.max(0.12, Math.abs(Math.sin(angle))), -horizontal).normalize();
    this.lightCamera.position.copy(towardLight).multiplyScalar(27).add(new Vector3(0, 3, 0));
    this.lightCamera.lookAt(0, 3, 0);
    this.lightCamera.updateMatrixWorld();
    this.lightMatrix.multiplyMatrices(this.lightCamera.projectionMatrix, this.lightCamera.matrixWorldInverse);
    towardLight.transformDirection(camera.matrixWorldInverse);
    const applyDeferred = fx.deferred !== 0;
    this.lightingUniforms.shadows!.value = !!fx.shadows;
    this.lightingUniforms.lightingMode!.value = fx.lighting;
    this.lightingUniforms.shininess!.value = fx.shininess;
    this.lightingUniforms.roughness!.value = fx.roughness;
    this.lightingUniforms.metalness!.value = fx.metalness;
    this.lightingUniforms.useRim!.value = !!fx.rim;
    this.lightingUniforms.useCel!.value = !!fx.cel;
    this.surfaceControls.deferred.value = applyDeferred && this.buffer !== "Forward color";
    this.surfaceControls.textureMode.value = fx.texture;
    this.surfaceControls.normalMode.value = fx.normals;
    this.surfaceControls.ripples.value = !!fx.ripples;
    if (this.swatch) this.swatch.visible = !!fx.swatch;
    this.aoRadius.value = fx.aoRadius;
    this.waterTime.value = state.waterTime;
    this.updateParts();

    if (fx.shadows || this.buffer === "Shadow map") {
      if (this.swatch) this.swatch.visible = false;
      for (const part of this.parts) part.mesh.material = part.shadow;
      gpu.renderer.setRenderTarget(this.shadowTarget);
      gpu.renderer.render(this.scene, this.lightCamera);
      for (const part of this.parts) part.mesh.material = part.shader;
      if (this.swatch) this.swatch.visible = !!fx.swatch;
    }
    gpu.renderer.setRenderTarget(this.opaqueTarget);
    gpu.renderer.render(this.scene, camera);
    if (applyDeferred || this.buffer === "Deferred color") gpu.draw(this.deferredPass, this.deferredTarget);
    if (fx.ao || this.buffer.startsWith("SSAO")) {
      gpu.draw(this.aoPass, this.aoRaw);
      gpu.draw(this.aoFilterPass, this.aoSmooth);
    }
    gpu.renderer.setRenderTarget(this.waterTarget);
    gpu.renderer.render(this.waterScene, camera);

    this.relativeIndex.value = fx.rior;
    this.refractionOn.value = !!fx.refraction;
    gpu.draw(state.side === "A" ? this.refractionA : this.refractionB, this.hitTarget);
    this.reflectionPass.uniforms.enabled!.value = !!fx.reflection;
    gpu.draw(this.reflectionPass, this.reflectionTarget);
    this.compositePass.uniforms.opaqueColor!.value = this.surfaceControls.deferred.value ? this.deferredTarget.textures[0] : this.opaqueTarget.textures[2];
    this.compositePass.uniforms.applyAO!.value = !!fx.ao;
    this.compositePass.uniforms.reflectOn!.value = !!fx.reflection;
    this.compositePass.uniforms.fresnel!.value = !!fx.fresnel;
    this.compositePass.uniforms.foamDepth!.value = fx.foam ? fx.foamDepth : 0;
    gpu.draw(this.compositePass, this.compositeTarget);
    const output = this.post.render(this.compositeTarget.texture, fx, state, daylight, this.buffer);
    this.focusUV.fromArray(state.focus);
    this.displayPass.uniforms.encoding!.value = fx.encoding;
    this.displayPass.uniforms.aberration!.value = fx.chromatic;
    this.displayPass.uniforms.fringe!.value = fx.fringe;
    this.show(output);
  }

  private show(output: Texture) {
    const opaque = this.opaqueTarget;
    const hit = this.hitTarget.texture;
    const deferred = !!this.state.activeEffects().deferred;
    const lighting = deferred ? this.deferredTarget.textures[1]! : opaque.textures[3]!;
    let input: Texture = this.compositeTarget.texture;
    let style = 0;
    if (this.buffer === "Final color") { input = output; style = 9; }
    if (isPostBuffer(this.buffer)) {
      const view = this.post.view(this.buffer, this.state.activeEffects());
      input = view.texture;
      style = view.style;
    }
    switch (this.buffer) {
      case "Opaque color": input = deferred ? this.deferredTarget.texture : opaque.textures[2]!; break;
      case "Forward color": input = opaque.textures[2]!; break;
      case "Deferred color": input = this.deferredTarget.texture; break;
      case "Shadow map": input = this.shadowTarget.depthTexture!; style = 2; break;
      case "Specular": input = lighting; break;
      case "Shadow visibility": input = lighting; style = 4; break;
      case "SSAO raw": input = this.aoRaw.texture; style = 1; break;
      case "SSAO filtered": input = this.aoSmooth.texture; style = 1; break;
      case "Reflection mask": input = this.reflectionTarget.texture; style = 4; break;
      case "Reflection hit UV": input = this.reflectionTarget.texture; style = 3; break;
      case "Reflection color": input = this.compositeTarget.textures[2]!; break;
      case "Refracted color": input = this.compositeTarget.textures[1]!; break;
      case "Fresnel weight": input = this.compositeTarget.textures[3]!; style = 4; break;
      case "Foam": input = this.compositeTarget.textures[3]!; style = 1; break;
      case "Flow direction": input = this.waterTarget.textures[2]!; style = 7; break;
      case "Flow UV": input = this.waterTarget.textures[2]!; style = 8; break;
      case "Water depth": input = this.waterTarget.depthTexture!; style = 5; break;
      case "Albedo": input = opaque.textures[0]!; break;
      case "Encoded normals": input = opaque.textures[1]!; style = 1; break;
      case "Raw depth": input = opaque.depthTexture!; style = 2; break;
      case "Linear depth": input = opaque.depthTexture!; style = 5; break;
      case "View position": input = opaque.depthTexture!; style = 6; break;
      case "Water mask": input = hit; style = 4; break;
      case "Refraction hit UV": input = hit; style = 3; break;
      case "Water normals": input = this.waterTarget.textures[0]!; style = 1; break;
    }
    this.displayPass.uniforms.source!.value = input;
    this.displayPass.uniforms.style!.value = style;
    this.gpu.draw(this.displayPass, null);
  }

  async sound(enabled: boolean) {
    const request = ++this.audioRequest;
    if (!enabled) { this.audio.forEach(player => player.pause()); return; }
    try { await Promise.all(this.audio.map(player => player.play())); }
    catch (error) {
      if (request !== this.audioRequest) return;
      this.audio.forEach(player => player.pause());
      throw error;
    }
  }

  project(world: [number, number, number]): [number, number] | null {
    const screen = new Vector3().fromArray(world).project(this.camera);
    return Math.abs(screen.x) <= 1 && Math.abs(screen.y) <= 1 && Math.abs(screen.z) <= 1
      ? [(screen.x + 1) * 0.5, (screen.y + 1) * 0.5] : null;
  }

  pick(x: number, y: number) {
    this.raycaster.setFromCamera(new Vector2(x * 2 - 1, y * 2 - 1), this.camera);
    const hit = this.raycaster.intersectObject(this.scene, true).find(candidate => candidate.object.visible);
    if (!hit) return null;
    this.state.focus = [x, y];
    const local = hit.object.worldToLocal(hit.point.clone());
    const view = hit.point.clone().applyMatrix4(this.camera.matrixWorldInverse);
    return { object: hit.object.name, local, world: hit.point, view, screen: view.clone().applyMatrix4(this.camera.projectionMatrix) };
  }
}
