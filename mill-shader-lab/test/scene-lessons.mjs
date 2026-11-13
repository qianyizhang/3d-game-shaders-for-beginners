import assert from "node:assert/strict";
import { labPage, watchErrors, withLab } from "./browser.mjs";
import { pixelStats, samePixels } from "./pixels.mjs";

const scenes = ["weather-station", "ferry-landing", "glasshouse", "night-market", "puppet-yard"];
const riggedScenes = new Set(["glasshouse", "puppet-yard"]);
const requested = process.argv.slice(2);
assert.ok(requested.every(slug => scenes.includes(slug)) && new Set(requested).size === requested.length,
  "Pass distinct scene slugs: " + scenes.join(", "));
const selected = requested.length ? requested : scenes;

const bookmarks = [
  "Overview", "Wall and roof", "Waterline", "Across the pond",
  "Night window", "Near to far", "Chimney", "Camera sweep",
];
const startingFrame = "Frame 60 · 1.00 s";

async function creatureRig(ui) {
  const { $, page, open, view, shot, reveal, check } = ui;
  const step = async () => {
    for (let i = 0; i < 8; i++) await $("step").click();
  };
  await open("refraction");
  const rest = await view("Opaque color");
  await step();
  const moving = await shot();
  const { count } = await pixelStats(page, rest, moving, { threshold: 3 });
  assert.ok(count > 60, `Frame steps must articulate the opaque creature: ${count} changed pixels`);

  await reveal("scene-effects");
  await check("props", false);
  const frozen = await shot();
  const heldFrame = await $("clock").textContent();
  await step();
  assert.notEqual(await $("clock").textContent(), heldFrame, "The scene clock still advances");
  await samePixels(page, frozen, await shot(), "Disabling creature motion freezes its current pose");
  await check("props", true);
  await step();
  assert.ok((await pixelStats(page, frozen, await shot(), { threshold: 3 })).count > 60,
    "The rig resumes movement after re-enabling props");
}

async function poseLesson(ui, slug) {
  const { $, page, open, view, shot, side, click, choose } = ui;
  await open("pose");
  assert.equal(await $("pose-angle").isVisible(), false);
  for (let i = 0; i < 3; ++i) await $("step").click();
  const frame = await $("clock").textContent();
  const animated = await shot();
  await click("Freeze frame");
  await samePixels(page, animated, await shot(), "Freeze holds the current animated pose");
  assert.equal(await $("step").isDisabled(), true);
  assert.equal(await $("play").isDisabled(), true);
  assert.equal(await $("bookmark").isDisabled(), true);
  await $("scene").press("Space");
  const joint = slug === "glasshouse" ? "vermilion-koi-tail" : "dragon-tail-3";
  const child = slug === "glasshouse" ? "vermilion-koi-fork" : "dragon-tail-4";
  await choose("pose-joint", joint);
  await $("pose-angle").press("End");
  assert.equal(await $("pose-angle").inputValue(), "32");
  await choose("pose-joint", child);
  assert.equal(await $("pose-angle").inputValue(), "0");
  await choose("pose-joint", joint);
  assert.equal(await $("pose-angle").inputValue(), "32", "Joint values are retained when selecting a different hinge");
  const deltas = {};
  for (const buffer of ["Final color", "Refracted color", "Refraction hit UV", "Shadow visibility"]) {
    const b = await view(buffer);
    await side("a");
    const a = await shot();
    const { count } = await pixelStats(page, a, b, { threshold: 6 });
    assert.ok(count > 30, `${buffer} must respond to joint rotation: ${count} changed pixels`);
    deltas[buffer] = count;
    await side("b");
    await samePixels(page, b, await shot(), `${buffer}: switching sides restores B`);
  }
  // With shadows disabled, the inspector still marks geometry coverage.
  // Pose-dependent silhouette changes alone must not account for the result.
  await ui.reveal("scene-effects");
  await ui.check("fx-shadows", false);
  const unshadowedB = await view("Shadow visibility");
  await side("a");
  const coverage = await pixelStats(page, unshadowedB, await shot(), { threshold: 6 });
  assert.ok(deltas["Shadow visibility"] > coverage.count + 30, "A changed cast shadow must reach the receiver");
  await ui.check("fx-shadows", true);
  assert.equal(await $("clock").textContent(), frame);
  const edited = await view("Final color");
  await click("Save B as A");
  await side("a");
  await samePixels(page, edited, await shot(), "Save B as A copies all joint offsets");
  await $("pose-angle").press("Home");
  assert.equal(await $("side-b").getAttribute("aria-pressed"), "true");
  assert.ok((await pixelStats(page, edited, await shot())).count > 30);
  await side("a");
  await samePixels(page, edited, await shot(), "Further edits cannot change the saved reference");
  await click("Unfreeze frame");
  assert.equal(await $("pose-angle").isVisible(), false);
  await samePixels(page, animated, await shot(), "Unfreeze clears both poses without jumping in time");
  await $("step").click();
  assert.notEqual(await $("clock").textContent(), frame);
  await click("Freeze frame");
  assert.equal(await $("pose-angle").inputValue(), "0");
  await $("reset").click();
  assert.equal(await $("clock").textContent(), startingFrame);
  assert.equal(await $("pose-angle").isVisible(), false);
  console.log(`${slug}: frozen pose changes ${JSON.stringify(deltas)}; reference save, unfreeze, and reset passed`);
}

function lessonChecks(ui) {
  const { $, page, choose, check, click, control: set, reveal, shot, side, view } = ui;
  const pixels = (image, other, options) => pixelStats(page, image, other, options);
  const diff = async (a, b, label, minimum = 100, threshold = 6) => {
    const { count, mean } = await pixels(a, b, { threshold });
    assert.ok(count >= minimum, `${label}: ${count} changed pixels (need ${minimum}), mean ${mean.toFixed(3)}`);
  };
  const same = (a, b, label) => samePixels(page, a, b, label);
  const pair = async (buffer = "Final color") => {
    await choose("buffer", buffer);
    await side("a"); const a = await shot();
    const clock = await $("clock").textContent();
    await side("b"); const b = await shot();
    assert.equal(await $("clock").textContent(), clock, "Switching A/B must hold the clock");
    return [a, b];
  };
  const stage = async (buffer, fragment, vertex) => {
    await choose("buffer", buffer);
    await reveal("shader-code");
    await choose("shader-stage", "fragment");
    await page.waitForFunction(() => !!document.querySelector("#code")?.textContent);
    assert.match(await $("code").textContent(), fragment);
    if (vertex) {
      await choose("shader-stage", "vertex");
      assert.match(await $("code").textContent(), vertex);
    }
    await $("shader-code").locator("summary").click();
  };
  const focus = async where => {
    await click(`Focus ${where}`);
    const point = await $("point").textContent();
    assert.match(point, /Object .*World .*View .*Screen UV/, `Focus ${where}: ${point}`);
  };

  return [
    ["spaces", "Overview", async () => {
      const position = await view("View position");
      const depth = await view("Linear depth");
      assert.ok((await pixels(depth)).max > 40, "The overview must have visible opaque depth");
      await diff(position, depth, "View position and linear depth encode different values", 300);
      await stage("Encoded normals", /layout\(location = 0\)/, /modelViewMatrix/);
    }],
    ["material", "Wall and roof", async () => {
      const authored = await view("Albedo");
      await choose("texture", 0);
      await diff(authored, await shot(), "UV checker vs. authored albedo", 300);
      await choose("texture", 1);
      const sampled = await view("Encoded normals");
      const sampledDepth = await view("Raw depth");
      await choose("normals", 0);
      await same(sampledDepth, await shot(), "Flat and sampled normals share the same depth");
      const flat = await view("Encoded normals");
      await diff(sampled, flat, "Sampled normal map vs. flat normals", 100, 2);
      await stage("Albedo", /texture\(normalMap, texUV\)/, /modelViewMatrix/);
    }],
    ["lighting", "Wall and roof", async () => {
      await set("shininess", 8);
      const specular = await view("Specular");
      assert.ok((await pixels(specular)).max > 5, "The material shot must show a specular highlight");
      await choose("lighting", 0);
      const diffuse = await shot();
      assert.equal((await pixels(diffuse)).colored, 0, "Diffuse mode must clear the specular buffer");
      await diff(specular, diffuse, "Specular highlight vs. diffuse", 35, 2);
      const shadowed = await view("Shadow visibility");
      await check("shadows", false);
      await diff(shadowed, await shot(), "Shadow casters change visibility", 40);
    }],
    ["ggx", "Wall and roof", async () => {
      await set("roughness", 0.27);
      const polished = await view("Specular");
      await set("roughness", 0.82);
      await diff(polished, await shot(), "GGX roughness changes the specular lobe", 35, 2);
      const alloy = await view("Final color");
      await set("metalness", 0.95);
      await diff(alloy, await shot(), "GGX metalness changes the surface");
    }],
    ["stylized", "Across the pond", async () => {
      const constant = await view("Fresnel weight");
      await check("fresnel", true);
      await diff(constant, await shot(), "Fresnel water reflection weight");
      const plain = await view("Opaque color");
      await check("rim", true);
      await diff(plain, await shot(), "Artistic rim");
      await check("rim", false);
      await check("cel", true);
      await diff(plain, await shot(), "Cel lighting bands");
    }],
    ["deferred", "Overview", async () => {
      const [a, b] = await pair();
      assert.ok((await pixels(a)).colored > 1000, "The matched lighting shot must not be empty");
      const { mean } = await pixels(a, b);
      assert.ok(mean < 3.5, `Forward and deferred must agree, mean RGB error ${mean.toFixed(3)}`);
      await stage("Deferred color", /texture\(albedoTexture, screenUV\)/);
    }],
    ["refraction", "Waterline", async () => {
      await set("rior", 0.935);
      const [a, b] = await pair();
      const mask = await view("Water mask");
      const ab = await pixels(a, b, { mask, threshold: 0 });
      assert.ok(ab.count > 500 && ab.outsideChanges === 0,
        `Index changes only water: ${ab.count} changed, ${ab.outsideChanges} outside`);
      const hit = await view("Refraction hit UV");
      const { hits, misses } = await pixels(hit);
      assert.ok(hits > 250 && misses > 20, `Refraction must hit and miss: ${hits} hits, ${misses} misses`);
      const bent = await view("Refracted color");
      await reveal("scene-effects");
      await check("fx-refraction", false);
      const { missChanges } = await pixels(bent, await shot(), { mask: hit, threshold: 0 });
      assert.equal(missChanges, 0, "Misses match the undistorted sample exactly");
    }],
    ["reflection", "Across the pond", async () => {
      const [mirror, rippled] = await pair("Reflection hit UV");
      const { hits, misses } = await pixels(rippled);
      assert.ok(hits > 80 && misses > 80, `Reflection must hit and miss: ${hits} hits, ${misses} misses`);
      await diff(mirror, rippled, "Mirror vs. rippled reflection UVs");
      await $("scene").press("ArrowRight");
      await diff(rippled, await shot(), "A camera orbit changes available reflections");
    }],
    ["foam", "Waterline", async () => {
      await set("foamDepth", 0.4);
      const thin = await view("Foam");
      await set("foamDepth", 2.8);
      const broad = await shot();
      await diff(thin, broad, "Foam band widens with greater contact depth");
      assert.ok((await pixels(broad)).colored > (await pixels(thin)).colored + 50,
        "The broad band covers more pixels");
      const stopped = await view("Flow UV");
      for (let i = 0; i < 3; i++) await $("step").click();
      await diff(stopped, await shot(), "Stepping advances flow-map UVs", 200, 2);
    }],
    ["fog", "Near to far", async () => {
      const [ramp, exponential] = await pair("Fog amount");
      await diff(ramp, exponential, "Linear vs. exponential fog");
      await set("density", 0.55);
      await diff(exponential, await shot(), "Exponential fog responds to density");
    }],
    ["smoke", "Chimney", async () => {
      const [sprites, volume] = await pair("Smoke mask");
      for (const [kind, png] of [["sprite", sprites], ["volume", volume]]) {
        const { max, colored } = await pixels(png);
        assert.ok(max > 20 && colored > 20, `${kind} smoke must have visible opacity: max ${max}, pixels ${colored}`);
      }
      await diff(sprites, volume, "Sprite vs. ray-marched opacity", 35);
      await choose("smoke", 0);
      assert.equal((await pixels(await shot())).colored, 0, "Smoke off clears the opacity buffer");
    }],
    ["ssao", "Wall and roof", async () => {
      const raw = await view("SSAO raw");
      const filtered = await view("SSAO filtered");
      const { min, max } = await pixels(raw);
      assert.ok(max - min > 20 && min < 220, `No visible occlusion at joints: ${min}–${max}`);
      await diff(raw, filtered, "AO filtering changes local occlusion", 40, 3);
      await set("aoRadius", 1.72);
      await diff(filtered, await shot(), "AO radius changes coverage", 50, 3);
    }],
    ["outline", "Wall and roof", async () => {
      const [position, depthNormal] = await pair("Outline edges");
      assert.ok((await pixels(depthNormal)).colored > 100, "Depth/normal outline mask should contain edges");
      await diff(position, depthNormal, "Position vs. depth/normal edge sources");
    }],
    ["focus", "Near to far", async () => {
      await set("aperture", 2.5);
      await focus("near");
      const near = await view("Focus / blur mask");
      await focus("far");
      await diff(near, await shot(), "Near/far focus changes the blur mask", 200);
      const blurred = await view("Blurred source");
      await diff(blurred, await view("Dilated blur"), "Dilation extends far colors under a foreground edge", 40);
    }],
    ["motion", "Camera sweep", async () => {
      await click("Hold sweep frame");
      const [a, b] = await pair();
      await diff(a, b, "Camera sweep produces motion blur", 100, 3);
      await click("Stopped camera");
      const [stillA, stillB] = await pair();
      await same(stillA, stillB, "A stationary camera has no motion blur");
    }],
    ["filter", "Wall and roof", async () => {
      await set("blurSize", 4);
      await choose("filter", 2);
      const gaussian = await view("Filtered color");
      await choose("filter", 3);
      await diff(gaussian, await shot(), "Gaussian vs. Kuwahara on real detail");
    }],
    ["bloom", "Night window", async () => {
      assert.equal(await $("bloom").inputValue(), "2", "This Chrome run should support HDR bloom");
      const bright = await view("Bloom extraction");
      const { colored, max } = await pixels(bright);
      assert.ok(max > 40 && colored > 20 && colored < 45000,
        `HDR must extract a localized bright source: max ${max}, pixels ${colored}`);
      await diff(bright, await view("Bloom blur"), "The HDR bloom blur spreads energy", 40);
      const [legacy, hdr] = await pair();
      await diff(legacy, hdr, "Legacy vs. HDR bloom final output");
    }],
    ["sampling", "Wall and roof", async () => {
      const stock = await view("Display linear");
      await check("poster", true);
      await choose("posterStyle", 1);
      await diff(stock, await shot(), "RGB posterization");
      await check("poster", false);
      await check("pixel", true);
      await set("blockSize", 16);
      await diff(stock, await shot(), "Pixel blocks");
      await check("pixel", false);
      await check("sharpen", true);
      await set("sharpness", 1.6);
      await diff(stock, await shot(), "Sharpened edges");
    }],
    ["grain", "Night window", async () => {
      const frame = await view("Display linear");
      await $("step").click();
      assert.notEqual(await $("clock").textContent(), startingFrame);
      await diff(frame, await shot(), "Grain changes when the clock steps");
      await check("grain", false);
      await set("fringe", 0.068);
      await choose("chromatic", 0);
      const noFringe = await view("Final color");
      await choose("chromatic", 2);
      await diff(noFringe, await shot(), "Picked-focus fringing changes RGB at edges");
    }],
    ["grade", "Overview", async () => {
      await choose("grade", 0);
      const plain = await view("Graded linear");
      await choose("grade", 1);
      const neutral = await shot();
      const { mean } = await pixels(plain, neutral);
      assert.ok(mean < 2, `Neutral LUT must approximate identity, mean RGB error ${mean.toFixed(3)}`);
      await choose("grade", 2);
      const day = await shot();
      await choose("grade", 3);
      const night = await shot();
      assert.ok((await pixels(day)).colored > 1000 && (await pixels(night)).colored > 1000,
        "Both color LUTs should preserve visible image detail");
      await diff(day, night, "Day and night LUTs");
      await choose("grade", 0);
      await check("grayRamp", true);
      const srgb = await view("Final color");
      await choose("encoding", 1);
      await diff(srgb, await shot(), "sRGB vs. legacy power encoding", 500);
    }],
  ];
}

const failures = [];
await withLab(async ({ base, context }) => {
  const desktop = await context({ viewport: { width: 920, height: 760 } });
  for (const slug of selected) {
    const page = await desktop.newPage();
    try {
      const assertClean = watchErrors(page);
      const ui = labPage(page);
      const { $, open, ready } = ui;
      await page.goto(new URL(`?scene=/mill-assets/scene-gallery/${slug}/waterline.json`, base).href);
      await ready();
      const matrix = lessonChecks(ui);
      const optionValues = id => $(id).locator("option").evaluateAll(options => options.map(option => option.value));
      const expected = matrix.map(([id]) => id);
      if (riggedScenes.has(slug)) expected.push("pose");
      assert.deepEqual((await optionValues("lesson")).sort(), expected.sort(),
        "Each scene must expose the shared exercises, plus posing where rigs are present");
      assert.deepEqual((await optionValues("bookmark")).sort(), [...bookmarks].sort(),
        "Each scene must expose all eight settings");
      let passed = 0;
      for (const [id, bookmark, verify] of matrix) {
        try {
          await open(id);
          assert.equal(await $("bookmark").inputValue(), bookmark, "Lesson opens its named setting");
          assert.equal(await $("clock").textContent(), startingFrame, "Lesson resets to the paused reference");
          await verify();
          passed++;
        } catch (error) {
          failures.push(new Error(`${slug} / ${id}: ${error.message}`, { cause: error }));
          console.error(failures.at(-1).message);
        }
      }
      if (riggedScenes.has(slug)) {
        try {
          await creatureRig(ui);
          console.log(`${slug}: creature rig advances, freezes, and resumes`);
          await poseLesson(ui, slug);
        } catch (error) {
          failures.push(new Error(`${slug} / creature rig: ${error.message}`, { cause: error }));
          console.error(failures.at(-1).message);
        }
      }
      assertClean();
      console.log(`${slug}: ${passed}/${matrix.length} live lessons verified`);
    } catch (error) {
      failures.push(new Error(`${slug}: ${error.message}`, { cause: error }));
      console.error(failures.at(-1).message);
    } finally {
      await page.close();
    }
  }
});
assert.equal(failures.length, 0, failures.map(error => error.message).join("\n"));
