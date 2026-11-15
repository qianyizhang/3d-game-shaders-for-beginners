import assert from "node:assert/strict";
import { pixelStats, samePixels } from "./pixels.mjs";

// Exercise the same selection, effect and A/B routes used by learners. Source
// assertions are paired with pixels so a correct label cannot hide stale work.
export async function inspectionChecks(ui) {
  const { $, page, open, choose, reveal, control, side, shot, view } = ui;
  await open("deferred");
  await choose("buffer", "Opaque color");
  await reveal("shader-code");
  await choose("shader-stage", "fragment");
  await side("a");
  assert.match(await $("chain").textContent(), /^Opaque geometry lighting → Water composite$/);
  assert.match(await $("code").textContent(), /texture\(colorMap, texUV\)/);
  const forward = await shot();
  await side("b");
  assert.match(await $("chain").textContent(), /^Fullscreen lighting → Water composite$/);
  assert.match(await $("code").textContent(), /texture\(albedoTexture, screenUV\)/);
  const deferred = await shot();
  assert.ok((await pixelStats(page, forward, deferred)).mean < 3.5, "Selected source and opaque image follow A/B");
  await samePixels(page, deferred, await view("Deferred color"), "Opaque deferred uses the actual deferred attachment");
  await samePixels(page, forward, await view("Forward color"), "Forward inspection overrides deferred geometry mode");
  await control("deferred", 0);
  await choose("buffer", "Deferred color");
  assert.match(await $("chain").textContent(), /Inspector only$/);
  await samePixels(page, deferred, await shot(), "Disabled deferred lighting is still produced for inspection");

  await open("ssao");
  await control("ao", 0);
  const ao = await view("SSAO filtered");
  assert.match(await $("chain").textContent(), /Inspector only$/);
  assert.match(await $("code").textContent(), /rawAO/);
  assert.ok((await pixelStats(page, ao)).min < 175, "Disabled AO inspection must contain computed occlusion");
  await control("ao", 1);
  assert.match(await $("chain").textContent(), /Water composite$/);
  await samePixels(page, ao, await shot(), "AO toggle changes consumption, not the inspected computation");

  await open("lighting");
  await control("shadows", 0);
  const shadow = await view("Shadow map");
  await control("shadows", 1);
  await samePixels(page, shadow, await shot(), "Disabled shadows still compute the inspected light-space depth");

  await open("refraction");
  await choose("buffer", "Refraction hit UV");
  await side("b");
  await reveal("editor");
  await $("bend").fill("2.0");
  await $("apply").click();
  assert.match(await $("code").textContent(), /mix\(incident, bent, \(2\.0\)\)/);
  const edited = await shot();
  const accepted = await $("code").textContent();
  await $("bend").fill("notAFloat");
  await $("apply").click();
  assert.match(await $("compile").textContent(), /Last working shader kept/);
  assert.equal(await $("code").textContent(), accepted);
  await samePixels(page, edited, await shot(), "Failed edit keeps inspected source and UV pixels together");
  await side("a");
  assert.match(await $("code").textContent(), /mix\(incident, bent, \(1\.0\)\)/);
  assert.ok((await pixelStats(page, edited, await shot())).count > 100, "A uses the default refraction program");
  await side("b");
  assert.equal(await $("code").textContent(), accepted);
  await samePixels(page, edited, await shot(), "B restores the accepted program and UV attachment");
  await $("reset").click();
  await choose("buffer", "Refraction hit UV");
  assert.match(await $("code").textContent(), /mix\(incident, bent, \(1\.0\)\)/);

  await bloomInspectionChecks(ui, true);
  await $("shader-code").locator("summary").click();
  console.log("Inspection: source/image agreement, live explanations, disabled work and shader recovery passed");
}

export async function bloomInspectionChecks(ui, hdr) {
  const { $, page, open, choose, reveal, shot, view } = ui;
  await open("bloom");
  await choose("buffer", "Bloom blur");
  await reveal("shader-code");
  await choose("shader-stage", "fragment");
  assert.match(await $("code").textContent(), /uniform vec2 axis/);
  if (hdr) {
    assert.match(await $("chain").textContent(), /Bloom add$/);
    assert.match(await $("description").textContent(), /HDR/);
  }
  const initial = await shot();
  await choose("bloom", 1);
  assert.match(await $("chain").textContent(), /Inspector only$/);
  assert.match(await $("description").textContent(), /Legacy bloom add uses extraction directly/);
  const legacy = await shot();
  assert.ok((await pixelStats(page, legacy)).colored > 50, "Legacy inspection blur must be computed");
  if (hdr) assert.ok((await pixelStats(page, initial, legacy)).count > 50, "Changing the bloom path changes the inspected blur");
  await choose("bloom", 0);
  assert.equal(await $("bloom").inputValue(), "0", "Inspection must not enable bloom");
  await samePixels(page, legacy, await shot(), "Bloom off retains the diagnostic legacy blur");
  const extracted = await view("Bloom extraction");
  assert.match(await $("chain").textContent(), /^Legacy thresholded neighborhood → Bloom add$/);
  assert.match(await $("code").textContent(), /uniform sampler2D bloomTexture/);
  assert.ok((await pixelStats(page, extracted, legacy)).count > 50, "Blur and extraction use different targets");
}
