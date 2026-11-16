import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { labPage, watchErrors, withLab } from "./browser.mjs";

const assets = fileURLToPath(new URL("../../.local/mill-assets/", import.meta.url));
await mkdir(assets, { recursive: true });
const fixture = await mkdtemp(join(assets, "test-smoke-"));
try {
  execFileSync("python3.12", [fileURLToPath(new URL("./browser_fixture.py", import.meta.url)), fixture],
    { stdio: "inherit" });
  await withLab(async ({ base, context }) => {
    const session = await context({ viewport: { width: 900, height: 700 } });
    const page = await session.newPage();
    const assertClean = watchErrors(page);
    const url = new URL(`?scene=/mill-assets/${basename(fixture)}/glasshouse/waterline.json`, base);
    await page.goto(url.href);
    const ui = labPage(page);
    await ui.ready();
    assert.match(await ui.$("status").textContent(), /Glasshouse.*WebGL 2 · Float targets available/i);
    await ui.open("refraction");
    await ui.choose("buffer", "Refraction hit UV");
    await ui.stable();
    await ui.reveal("editor");
    await ui.$("bend").fill("notAFloat");
    await ui.$("apply").click();
    assert.match(await ui.$("compile").textContent(), /Last working shader kept/);
    assert.equal(await ui.$("scene").isVisible(), true);

    url.searchParams.set("gpu", "none");
    await page.goto(url.href);
    await ui.$("fallback").waitFor();
    assert.match(await ui.$("failure").textContent(), /WebGL 2 with four draw buffers/);
    assertClean();
  });
  console.log("Shader Lab: generated scene, inspection, shader rejection and no-GPU fallback passed");
} finally {
  await rm(fixture, { recursive: true, force: true });
}
