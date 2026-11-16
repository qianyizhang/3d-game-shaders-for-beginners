import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const release = new URL("../shader-field-guide/demo.html", import.meta.url);
const browser = await chromium.launch(process.env.CI
  ? { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] }
  : { channel: "chrome" });
try {
  for (const fallback of [false, true]) {
    const page = await browser.newPage({ viewport: { width: 1000, height: 760 }, offline: true });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => {
      if (message.type() === "error" || message.text().startsWith("GL error")) errors.push(message.text());
    });
    await page.addInitScript(blockWebGL => {
      window.__shaderGuideDebug = true;
      if (blockWebGL) {
        const getContext = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (type, ...args) {
          return type === "webgl2" ? null : getContext.call(this, type, ...args);
        };
      }
    }, fallback);

    await page.goto(release.href + "#bloom");
    const mode = await page.locator("#renderMode").textContent();
    assert.match(mode, fallback ? /ILLUSTRATIVE 2D FALLBACK/ : /HDR HALF-FLOAT · WEBGL2/);
    const lessons = page.locator(".lesson-button");
    assert.equal(await lessons.count(), 17);
    assert.equal(await page.locator("[aria-current=true]").getAttribute("data-lesson-id"), "bloom");
    if (fallback) {
      assert.match(await page.locator("#chapterCaveat").textContent(), /No HDR or GPU shader/);
      await page.getByRole("button", { name: /Microfacet PBR/ }).click();
      assert.equal(await page.locator("#metallic").isDisabled(), true, "The illustration cannot change metalness");
    } else {
      for (const lesson of await lessons.all()) {
        const id = await lesson.getAttribute("data-lesson-id");
        await lesson.click();
        assert.equal(new URL(page.url()).hash, "#" + id);
        await page.evaluate(() => window.__shaderGuide.renderer.renderOnce());
        assert.deepEqual(errors, [], id);
      }
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log("Field Guide: standalone HDR WebGL2 lessons and labeled offline fallback passed");
} finally {
  await browser.close();
}
