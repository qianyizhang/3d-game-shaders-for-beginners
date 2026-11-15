import assert from "node:assert/strict";
import test from "node:test";
import { DepthTexture, Texture, WebGLRenderTarget } from "three";
import { createServer } from "vite";

const loader = await createServer({
  configFile: false, server: { middlewareMode: true, ws: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
});
let BufferInspection, inspectionCatalog, inspectionGroups, defaults, lessons;
try {
  ({ BufferInspection, inspectionCatalog, inspectionGroups } = await loader.ssrLoadModule("/src/inspection.ts"));
  ({ defaults } = await loader.ssrLoadModule("/src/effects.ts"));
  ({ lessons } = await loader.ssrLoadModule("/src/lessons.ts"));
} finally {
  await loader.close();
}

// Real CPU-side Three targets, without a renderer or GPU. full.mjs separately
// verifies pixels and source through the production UI and Chrome.
function setup(hdr = true) {
  const target = (count = 1, depth = false) => new WebGLRenderTarget(4, 4, {
    count, depthTexture: depth ? new DepthTexture(4, 4) : null,
  });
  const resources = {
    hdr,
    scene: { opaque: target(4, true), water: target(3, true), hit: target(), composite: target(4),
      shadow: target(1, true), deferred: target(2), reflection: target(), aoRaw: target(), aoSmooth: target() },
    post: { atmosphere: target(3), edge: target(2), filter: target(), dilated: target(), blurred: target(),
      dilatedBlur: target(), focus: target(2), motion: target(2), bright: target(), legacyBright: target(),
      bloomBlur: target(), combined: target(), color: target(2) },
  };
  const inspection = new BufferInspection(resources);
  const context = { effects: { ...defaults }, refractionProgram: { vertexShader: "accepted vertex", fragmentShader: "accepted A" } };
  return { resources, inspection, context, resolve: name => inspection.resolve(name, context) };
}

test("all lesson views resolve with the existing menu groups and unique names", () => {
  const { resolve } = setup();
  const names = inspectionCatalog.map(view => view.name);
  assert.equal(names.length, 42);
  assert.equal(new Set(names).size, names.length);
  assert.deepEqual(inspectionGroups, ["Output", "Geometry", "Water", "Lighting and AO", "Focus and motion", "Image effects"]);
  for (const lesson of lessons) for (const name of lesson.views) assert.ok(names.includes(name), name);
  for (const { name, group } of inspectionCatalog) {
    const view = resolve(name);
    assert.equal(view.info.name, name);
    assert.equal(view.info.group, group);
    assert.ok(view.shader.fragment.length > 0);
    assert.doesNotMatch(view.shader.fragment, /#include <lab_/);
    assert.ok(view.image(new Texture()).texture.isTexture);
  }
  assert.equal(resolve("Water depth").info.group, "Geometry");
  assert.equal(resolve("Smoke mask").info.group, "Image effects");
});

test("forward/deferred changes source, attachment and explanation together", () => {
  const { resolve, context, resources: { scene } } = setup();
  const forward = resolve("Opaque color");
  assert.equal(forward.image().texture, scene.opaque.textures[2]);
  assert.match(forward.shader.vertex, /modelViewMatrix/);
  assert.equal(forward.info.producer, "Opaque geometry lighting");
  context.effects.deferred = 1;
  const deferred = resolve("Opaque color");
  assert.equal(deferred.image().texture, scene.deferred.textures[0]);
  assert.match(deferred.shader.fragment, /texture\(albedoTexture, screenUV\)/);
  assert.equal(deferred.info.producer, "Fullscreen lighting");
  assert.equal(resolve("Specular").image().texture, scene.deferred.textures[1]);
  assert.deepEqual(resolve("Shadow visibility").image(), { texture: scene.deferred.textures[1], style: 4 });
  assert.equal(resolve("Forward color").work.scene.forward, true);
  assert.equal(resolve("Forward color").image().texture, scene.opaque.textures[2]);
  context.effects.deferred = 0;
  assert.equal(resolve("Deferred color").work.scene.deferred, true);
  assert.equal(resolve("Deferred color").info.consumer, "Inspector only");
  assert.equal(resolve("Specular").image().texture, scene.opaque.textures[3]);
});

test("refraction reads the accepted program on every resolve without caching edits", () => {
  const { resolve, context, resources } = setup();
  assert.equal(resolve("Refraction hit UV").shader.fragment, "accepted A");
  context.refractionProgram = { vertexShader: "accepted vertex", fragmentShader: "accepted B" };
  const edited = resolve("Refraction hit UV");
  assert.equal(edited.shader.fragment, "accepted B");
  assert.equal(edited.image().texture, resources.scene.hit.texture);
  assert.equal(resolve("Water mask").shader.fragment, "accepted B");
  assert.equal(resolve("Water mask").image().style, 4);
  context.refractionProgram = { vertexShader: "accepted vertex", fragmentShader: "accepted A" };
  assert.equal(resolve("Refraction hit UV").shader.fragment, "accepted A");
});

test("HDR, legacy and unavailable float targets resolve matching bloom explanations", () => {
  for (const hdr of [false, true]) for (const bloom of [0, 1, 2]) {
    const { resolve, context, resources: { post } } = setup(hdr);
    context.effects.bloom = bloom;
    const activeHDR = hdr && bloom === 2;
    assert.equal(resolve("Bloom extraction").image().texture, activeHDR ? post.bright.texture : post.legacyBright.texture);
    assert.equal(resolve("Bloom extraction").info.producer, activeHDR ? "HDR bright-pass" : "Legacy thresholded neighborhood");
    const blur = resolve("Bloom blur");
    assert.equal(blur.image().texture, post.bloomBlur.texture);
    assert.deepEqual(blur.work.post, { bloom: true, bloomBlur: true });
    assert.equal(blur.info.consumer, activeHDR ? "Bloom add" : "Inspector only");
    assert.equal(resolve("Bloom combined").info.consumer, activeHDR ? "Tone mapping" : bloom === 1 ? "Color effects" : "Inspector only");
  }
});

test("disabled-effect inspection requests work without changing settings", () => {
  const { resolve, context } = setup();
  const before = structuredClone(context.effects);
  assert.equal(resolve("Shadow map").work.scene.shadow, true);
  assert.equal(resolve("Shadow map").info.consumer, "Inspector only");
  assert.equal(resolve("SSAO raw").work.scene.ao, true);
  assert.equal(resolve("SSAO filtered").info.consumer, "Inspector only");
  assert.equal(resolve("Smoke mask").work.post.atmosphere, true);
  assert.equal(resolve("Outline edges").work.post.outline, true);
  assert.deepEqual(resolve("Dilated blur").work.post, { focus: true, dilation: true });
  assert.deepEqual(resolve("Blurred source").work.post, { focus: true, blurred: true });
  assert.equal(resolve("Motion direction").work.post.motion, true);
  assert.equal(resolve("Filtered color").work.post.filter, true);
  assert.deepEqual(resolve("Final color").work, { scene: {}, post: {} });
  assert.deepEqual(context.effects, before);
  assert.equal(resolve("Blurred source").info.consumer, "Inspector only");
  assert.equal(resolve("Dilated blur").info.consumer, "Focus composite");
  context.effects.dilation = 0;
  assert.equal(resolve("Blurred source").info.consumer, "Focus composite");
  assert.equal(resolve("Dilated blur").info.consumer, "Inspector only");
});

test("shared attachments keep distinct channels and display encodings", () => {
  const { resolve, resources: { scene, post } } = setup();
  assert.deepEqual(resolve("Flow direction").image(), { texture: scene.water.textures[2], style: 7 });
  assert.deepEqual(resolve("Flow UV").image(), { texture: scene.water.textures[2], style: 8 });
  assert.deepEqual(resolve("Foam").image(), { texture: scene.composite.textures[3], style: 1 });
  assert.deepEqual(resolve("Fresnel weight").image(), { texture: scene.composite.textures[3], style: 4 });
  assert.deepEqual(resolve("Raw depth").image(), { texture: scene.opaque.depthTexture, style: 2 });
  assert.deepEqual(resolve("View position").image(), { texture: scene.opaque.depthTexture, style: 6 });
  assert.deepEqual(resolve("Display linear").image(), { texture: post.color.textures[1], style: 1 });
  assert.equal(resolve("Graded linear").image().style, 1);
  const final = new Texture();
  assert.deepEqual(resolve("Final color").image(final), { texture: final, style: 9 });
});

test("missing attachments fail through resolve and recover after repair", () => {
  const { resolve, resources: { scene } } = setup();
  const depth = scene.opaque.depthTexture;
  scene.opaque.depthTexture = null;
  assert.throws(() => resolve("Raw depth"), /Missing inspection attachment: Raw depth \(depth\)/);
  scene.opaque.depthTexture = depth;
  assert.equal(resolve("Raw depth").image().texture, depth);
  const highlight = scene.opaque.textures.pop();
  assert.throws(() => resolve("Specular"), /Missing inspection attachment: Specular \(3\)/);
  scene.opaque.textures.push(highlight);
  assert.equal(resolve("Specular").image().texture, highlight);
});
