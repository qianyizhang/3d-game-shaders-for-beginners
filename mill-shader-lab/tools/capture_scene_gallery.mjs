/** Capture real Lab renders for the five authored asset kits and build the gallery. */
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { labPage, watchErrors, withLab } from "../test/browser.mjs";
import { pixelStats, samePixels } from "../test/pixels.mjs";
import { gallery } from "./scene_gallery_page.mjs";

const root = new URL("../../.local/mill-assets/scene-gallery/", import.meta.url);
const read = async name => JSON.parse(await readFile(new URL(name, root), "utf8"));
const hasFile = name => stat(new URL(name, root)).then(info => info.isFile(), error => {
  if (error.code === "ENOENT") return false;
  throw error;
});
const entries = await read("catalog.json");
const only = process.argv.slice(2);
const selected = only.length ? entries.filter(entry => only.includes(entry.slug)) : entries;
assert.equal(selected.length, only.length || 5, "Select known scene slugs");
await mkdir(new URL("captures/", root), { recursive: true });
const frame = "Frame 60 · 1.00 s";
const reference = "1.05";
const experiment = 0.935;
const shotPath = name => fileURLToPath(new URL("captures/" + name + ".png", root));
const span = ([low, high]) => low.map((value, i) => high[i] - value);

function isolatedPose(part, subject) {
  const target = part.bounds[0].map((value, i) => value + span(part.bounds)[i] * .5);
  const [x, y, z] = span(part.bounds);
  const distance = Math.max(1.5, x * 1.28 + z * .48, y * 1.8, z * 1.48) * 1.13;
  return { target, offset: [distance * .62, distance * .43, distance * .76],
    fov: 40, near: .06, far: 85, sun: 232, subject };
}

await withLab(async ({ base, context }) => {
  const ctx = await context({ viewport: { width: 1140, height: 945 } });
  const page = await ctx.newPage();
  const ui = labPage(page);
  const assertClean = watchErrors(page);
  let virtualManifest;
  let virtualURL;
  await page.route(url => /\/mill-assets\/scene-gallery\/[^/]+\/isolated\.json$/.test(url.pathname), route => {
    assert.equal(route.request().url(), virtualURL);
    return route.fulfill({ json: virtualManifest });
  });
  const open = async (entry, file, title = entry.title) => {
    await page.goto(new URL(`?scene=/mill-assets/scene-gallery/${entry.slug}/${file}.json`, base).href);
    await ui.ready();
    assert.ok((await ui.$("status").textContent()).startsWith(title + " · WebGL 2"));
    assert.equal(await ui.$("clock").textContent(), frame);
  };
  const save = name => ui.shot({ path: shotPath(name) });
  let viewport;

  for (const entry of selected) {
    const waterline = entry.shots.find(shot => shot.slug === "waterline") ?? entry.shots[0];
    const baseManifest = await read(entry.slug + "/" + waterline.slug + ".json");
    const water = baseManifest.meshes.filter(mesh => mesh.role === "water");
    for (const shot of entry.shots) {
      await open(entry, shot.slug);
      assert.ok((await ui.$("lesson-task").textContent()).includes(entry.subject));
      if (shot !== waterline) await save(entry.slug + "-" + shot.slug);
      if (shot === waterline) {
        assert.equal(await ui.$("rior").inputValue(), reference);
        const a = await save(entry.slug + "-" + shot.slug);
        viewport ??= await ui.$("scene").evaluate(canvas => [canvas.width, canvas.height]);
        await ui.control("rior", experiment);
        const b = await save(entry.slug + "-bend");
        await ui.side("a");
        await samePixels(page, a, await ui.shot(), entry.slug + " returns to A");
        assert.equal(await ui.$("clock").textContent(), frame);
        await ui.side("b");
        await ui.choose("buffer", "Water mask");
        const mask = await save(entry.slug + "-mask");
        const change = await pixelStats(page, a, b, { mask, threshold: 0 });
        assert.ok(change.inside > 1500 && change.count > 750 && change.outsideChanges === 0, JSON.stringify(change));
        await ui.choose("buffer", "Refraction hit UV");
        const hit = await ui.shot();
        const { hits, misses } = await pixelStats(page, hit);
        assert.ok(hits > 1000, entry.slug + " must find submerged geometry");
        await ui.choose("buffer", "Refracted color");
        const bent = await ui.shot();
        await ui.reveal("scene-effects");
        await ui.check("fx-refraction", false);
        const fallback = await pixelStats(page, bent, await ui.shot(), { mask: hit, threshold: 0 });
        assert.equal(fallback.missChanges, 0, entry.slug + " misses must keep the unbent sample");
        console.log(`${entry.title}: ${change.count} changed pixels, zero outside water; ${hits} hits and ${misses} exact fallbacks`);
      }
    }
    await open(entry, waterline.slug);
    await ui.open("material");
    await ui.choose("buffer", "Albedo");
    await save(entry.slug + "-material-albedo");
    await ui.choose("texture", 0);
    await save(entry.slug + "-material-uv");
    await ui.choose("texture", 1);
    await ui.choose("buffer", "Encoded normals");
    await ui.choose("normals", 0);
    await save(entry.slug + "-material-flat");
    await ui.choose("normals", 1);
    await save(entry.slug + "-material-sampled");
    if (entry.creatures.length) {
      await ui.open("pose");
      await ui.click("Freeze frame");
      await ui.$("pose-angle").press("End");
      for (const [buffer, suffix] of [["Refracted color", "refraction"], ["Shadow visibility", "shadow"]]) {
        await ui.choose("buffer", buffer);
        await ui.side("a");
        await save(`${entry.slug}-pose-${suffix}-a`);
        await ui.side("b");
        await save(`${entry.slug}-pose-${suffix}-b`);
      }
    }
    for (const part of entry.parts) {
      if (part.role === "water") continue; // A flat plane reads best in the actual Water mask.
      const title = `${entry.title} · ${part.title}`;
      virtualURL = new URL(`mill-assets/scene-gallery/${entry.slug}/isolated.json`, base).href;
      virtualManifest = {
        ...baseManifest, scene: title, practice: undefined, rigs: undefined,
        waterline: isolatedPose(part, entry.subject),
        nightLights: [],
        meshes: [...part.meshes, ...water.map(mesh => ({ ...mesh, origin: [0, -100, 0] }))],
      };
      await open(entry, "isolated", title);
      await save(`${entry.slug}-part-${part.slug}`);
      const result = await pixelStats(page, await ui.view("Opaque color"));
      assert.ok(result.colored > 200, `Blank asset render: ${title}`);
    }
    console.log(`Captured ${entry.shots.length} views and ${entry.parts.length} part entries for ${entry.title}`);
  }

  if (only.length) { assertClean(); return; }
  const originalMill = await hasFile("../scene.json");
  if (originalMill) {
    await page.goto(base.href);
    await ui.ready();
    assert.match(await ui.$("status").textContent(), /^Original mill · WebGL 2/);
    await save("original-mill");
  }
  assertClean();
  const concepts = new Set();
  for (const entry of entries) {
    if (await hasFile(`../../mill-scene-concepts/boards/${entry.concept}.png`)) concepts.add(entry.concept);
  }
  const links = [];
  for (const [path, label] of [["../weather-station/index.html", "First Waterline prototype review"],
    ["../../mill-sourcing-boards/index.html", "Source and concept review"]]) {
    if (await hasFile(path)) links.push([path, label]);
  }
  await writeFile(new URL("index.html", root), gallery(entries, viewport, { originalMill, concepts, links }), "utf8");
});
