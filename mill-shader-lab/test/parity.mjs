import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { labPage, watchErrors, withLab } from "./browser.mjs";
import { pixelStats } from "./pixels.mjs";

const output = process.argv[2];
if (!output) throw new Error("Usage: npm run capture:parity -- OUTPUT_DIR [case ...]");
const only = new Set(process.argv.slice(3));
await mkdir(output, { recursive: true });

// These isolate the comparable legacy behavior. The full test also exercises modern variants.
const cases = {
  spaces: { lesson: "spaces", buffer: "Encoded normals", view: true },
  material: { lesson: "material", a: { normals: 0 }, b: { normals: 1 }, buffer: "Encoded normals" },
  lighting: { lesson: "lighting", a: { lighting: 1 }, b: { lighting: 2 }, buffer: "Specular" },
  fresnel: { lesson: "stylized", common: { reflection: 1 }, a: { fresnel: false }, b: { fresnel: true }, buffer: "Fresnel weight" },
  rim: { lesson: "stylized", common: { reflection: 0 }, a: { rim: false }, b: { rim: true } },
  cel: { lesson: "stylized", scene: "Wall and roof", common: { reflection: 0 }, a: { cel: false }, b: { cel: true } },
  refraction: { lesson: "refraction", a: { rior: 1.05 }, b: { rior: 0.935 }, buffer: "Refraction hit UV" },
  reflection: { lesson: "reflection", common: { fresnel: 0 }, a: { reflection: false }, b: { reflection: true }, buffer: "Reflection hit UV" },
  foam: { lesson: "foam", a: { foamDepth: 1.5 }, b: { foamDepth: 3 }, buffer: "Foam" },
  fog: { lesson: "fog", a: { fog: 0 }, b: { fog: 1 }, buffer: "Fog amount" },
  ssao: { lesson: "ssao", a: { ao: false }, b: { ao: true }, buffer: "SSAO filtered" },
  outline: { lesson: "outline", a: { outline: 0 }, b: { outline: 1 }, buffer: "Outline edges" },
  focus: { lesson: "focus", pick: [0.16, 0.13], a: { dof: false }, b: { dof: true }, buffer: "Focus / blur mask" },
  motion: { lesson: "motion", action: "Hold sweep frame", a: { motion: false }, b: { motion: true } },
  filter: { lesson: "filter", a: { filter: 0 }, b: { filter: 3 } },
  bloom: { lesson: "bloom", a: { bloom: 0 }, b: { bloom: 1 }, buffer: "Bloom extraction" },
  poster: { lesson: "sampling", a: { poster: false }, b: { poster: true } },
  pixel: { lesson: "sampling", a: { pixel: false }, b: { pixel: true } },
  sharpen: { lesson: "sampling", a: { sharpen: false }, b: { sharpen: true } },
  grain: { lesson: "grain", common: { chromatic: 0 }, a: { grain: false }, b: { grain: true } },
  chromatic: { lesson: "grain", common: { grain: 0 }, a: { chromatic: 0 }, b: { chromatic: 2 } },
  grade: { lesson: "grade", a: { grade: 0 }, b: { grade: 2 }, buffer: "Graded linear" },
};
for (const name of only) assert.ok(Object.hasOwn(cases, name), `Unknown case: ${name}`);

await withLab(async ({ base, context }) => {
  const desktop = await context({ viewport: { width: 1600, height: 1120 } });
  const page = await desktop.newPage();
  const assertClean = watchErrors(page);
  await page.goto(base.href);
  const { $, click, choose, control, open, ready, reveal, shot, stable } = labPage(page);
  await ready();
  // Exact 1200×900 GPU pixels, matching the native capture.
  await page.addStyleTag({ content: "main { max-width: 100%; } .workbench { grid-template-columns: 1200px minmax(0,1fr); } " });
  await reveal("scene-effects");
  const apply = async values => {
    for (const [key, value] of Object.entries(values ?? {})) await control(key, value);
  };
  const take = (name, suffix) => shot({ path: path.join(output, `${name}-${suffix}.png`), size: [1200, 900] });
  for (const [name, row] of Object.entries(cases)) {
    if (only.size && !only.has(name)) continue;
    await open(row.lesson);
    if (row.scene) await choose("bookmark", row.scene);
    await apply({ shadows: true, encoding: 1, ...row.common });
    if (row.action) await click(row.action);
    if (row.pick) {
      await stable();
      await $("scene").click({ position: { x: row.pick[0] * 1200, y: (1 - row.pick[1]) * 900 } });
      assert.match(await $("point").textContent(), /Screen UV/);
    }
    await apply(row.a);
    const a = await take(name, "a");
    await apply(row.b);
    if (row.view) await choose("buffer", row.buffer);
    const b = await take(name, "b");
    assert.ok((await pixelStats(page, a, b, { threshold: 0 })).count > 0, `${name}: the comparison must change the framebuffer`);
    if (row.buffer && !row.view) { await choose("buffer", row.buffer); await take(name, "buffer"); }
    console.log(`${name}: ${await $("stage-title").textContent()}, ${await $("clock").textContent()}`);
  }
  assertClean();
});
