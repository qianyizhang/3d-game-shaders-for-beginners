/** Exercise the generated offline delivery through its public UI. */
import assert from "node:assert/strict";
import {
  cp,
  mkdtemp,
  rm,
  rename,
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const output = resolve(
  process.env.DCC_GALLERY_DIR ?? join(root, ".local/dcc/gallery"),
);
const url = pathToFileURL(join(output, "index.html")).href;
const captures = process.env.DCC_GALLERY_CAPTURE_DIR;
if (captures) await mkdir(captures, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const temp = await mkdtemp(join(tmpdir(), "dcc-gallery-"));
const errors = [];
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1,
  reducedMotion: "reduce",
});
page.setDefaultTimeout(12000);
page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript(() => {
  const get = HTMLCanvasElement.prototype.getContext,
    canvases = new Set();
  HTMLCanvasElement.prototype.getContext = function (type, ...args) {
    if (type === "webgl2") {
      canvases.add(this);
      window.webglCanvasCount = canvases.size;
    }
    return get.call(this, type, ...args);
  };
});
const title = async (text) =>
  page.waitForFunction(
    (text) => document.querySelector("#asset-title").textContent === text,
    text,
  );
const ready = async () =>
  page.waitForFunction(
    () => document.querySelector("#viewer-status").dataset.state === "ready",
  );
const browse = async () =>
  page.waitForFunction(() => !document.querySelector("#browse").hidden);
const shot = async (name) => {
  if (captures) {
    await page.evaluate(() => {
      scrollTo(0, 0);
      return new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
    });
    await page.screenshot({ path: join(captures, name + ".png") });
  }
};
try {
  await page.goto(url);
  const objectCount = await page.evaluate(() =>
    Object.values(window.DCC_CATALOG.nodes).filter((node) => node.kind === "object").length,
  );
  assert.equal(await page.locator("#results li").count(), 5);
  await page.waitForFunction(
    () => [...document.querySelectorAll("#results .thumb img")].length === 5,
  );
  await shot("browse");
  assert.equal(await page.evaluate(() => window.webglCanvasCount), 1);
  await page.locator("#kind").selectOption("object");
  await page.locator("#query").fill("koi");
  assert.equal(await page.locator("#results li").count(), 3);
  const koi = page.locator("#results a").filter({ hasText: "Vermilion koi" });
  await koi.click();
  await title("Vermilion koi");
  await ready();
  assert.equal(await page.evaluate(() => window.webglCanvasCount), 2);
  assert.match(page.url(), /kind=object&q=koi/);
  const original = await page.locator("#model").screenshot();
  await page.getByRole("button", { name: "Rotate right", exact: true }).click();
  assert.notDeepEqual(await page.locator("#model").screenshot(), original);
  await page.getByRole("button", { name: "Reset view", exact: true }).click();
  assert.deepEqual(await page.locator("#model").screenshot(), original);
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  assert.notDeepEqual(await page.locator("#model").screenshot(), original);
  await page.getByRole("button", { name: "Zoom out", exact: true }).click();
  assert.deepEqual(await page.locator("#model").screenshot(), original);
  await page.locator("#model").focus();
  await page.keyboard.press("ArrowUp");
  assert.notDeepEqual(await page.locator("#model").screenshot(), original);
  await page.keyboard.press("Home");
  assert.deepEqual(await page.locator("#model").screenshot(), original);
  const box = await page.locator("#model").boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + 70,
    box.y + box.height / 2 + 30,
    { steps: 4 },
  );
  await page.mouse.up();
  assert.notDeepEqual(await page.locator("#model").screenshot(), original);
  await page.getByRole("button", { name: "Reset view", exact: true }).click();
  await page.locator("#uv").check();
  assert.notDeepEqual(await page.locator("#model").screenshot(), original);
  await page.locator("#uv").uncheck();
  await shot("inspect");
  await page
    .locator("#connections a")
    .filter({ hasText: "Vermilion koi · body" })
    .click();
  await title("Vermilion koi · body");
  await ready();
  await page
    .locator("#connections a")
    .filter({ hasText: "Lacquer · #EFE1B8" })
    .click();
  await title("Lacquer · #EFE1B8");
  assert.equal(await page.locator("#bindings li").count(), 5);
  assert.match(await page.locator("#rights").innerText(), /Project-authored/);
  await shot("material");
  await page.locator("#bindings a").filter({ hasText: "Base color" }).click();
  await page.waitForFunction(() => !document.querySelector("#texture").hidden);
  assert.match(
    await page.locator("#texture a").getAttribute("href"),
    /textures\/.*\.png$/,
  );
  await page.locator("#back-results").click();
  await browse();
  assert.equal(await page.locator("#query").inputValue(), "koi");
  assert.equal(await page.locator("#kind").inputValue(), "object");
  assert.equal(
    await page.evaluate(() => document.activeElement.dataset.asset),
    "object/glasshouse/vermilion-koi",
  );
  await koi.click();
  await ready();
  await page.goBack();
  await browse();
  assert.equal(
    await page.evaluate(() => document.activeElement.dataset.asset),
    "object/glasshouse/vermilion-koi",
  );
  await page.locator("#query").fill("no-such-object");
  assert.equal(await page.locator("#empty").isVisible(), true);
  await page.getByRole("button", { name: "Clear search", exact: true }).click();
  assert.equal(await page.locator("#results li").count(), objectCount);
  const last = page.locator("#results a").last();
  await last.scrollIntoViewIfNeeded();
  const scroll = await page.evaluate(() => scrollY);
  assert.ok(scroll > 0);
  await last.click();
  await ready();
  await page.locator("#back-results").click();
  await browse();
  assert.equal(await page.evaluate(() => scrollY), scroll);
  await page.locator("#tag").selectOption("creature");
  assert.ok((await page.locator("#results li").count()) > 0);
  assert.ok((await page.locator("#results li").count()) < objectCount);
  await page.getByRole("button", { name: "Reset filters" }).click();
  assert.equal(await page.locator("#results li").count(), 5);
  await page.goto(url + "#unknown/asset");
  await browse();
  assert.match(
    await page.locator("#route-status").innerText(),
    /not in this catalog/,
  );
  await page.goto(url + "#object/glasshouse/vermilion-koi");
  await ready();
  await title("Vermilion koi");
  await page.locator("#source-details summary").click();
  assert.equal(await page.locator("#facts a").count(), 1);
  assert.match(await page.locator("#facts").innerText(), /Reviewed delivery/);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await shot("phone-inspect");
  await page.locator("#back-results").click();
  await browse();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await shot("phone-browse");
  await page.setViewportSize({ width: 800, height: 1000 });
  await page.evaluate(() => (document.documentElement.style.fontSize = "32px"));
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.locator("#results a").first().click();
  await ready();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.evaluate(() => (document.documentElement.style.fontSize = ""));
  await page.setViewportSize({ width: 1440, height: 1000 });
  // A real missing file must fail, then succeed after restoration without a page reload.
  await cp(output, temp, { recursive: true });
  await rename(join(temp, "glasshouse.js"), join(temp, "glasshouse.saved"));
  await page.goto(
    pathToFileURL(join(temp, "index.html")).href +
      "#object/glasshouse/vermilion-koi",
  );
  await page.waitForFunction(
    () => document.querySelector("#viewer-status").dataset.state === "error",
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Retry preview", exact: true })
      .isVisible(),
    true,
  );
  await rename(join(temp, "glasshouse.saved"), join(temp, "glasshouse.js"));
  await page
    .getByRole("button", { name: "Retry preview", exact: true })
    .click();
  await ready();
  // Lose the real context; controls must stop claiming to work and expose recovery.
  await page
    .locator("#model")
    .evaluate((c) =>
      c.getContext("webgl2").getExtension("WEBGL_lose_context").loseContext(),
    );
  await page.waitForFunction(
    () =>
      document.querySelector("#viewer-status").dataset.state === "unavailable",
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Rotate left", exact: true })
      .isDisabled(),
    true,
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Reload gallery", exact: true })
      .isVisible(),
    true,
  );
  const unavailable = await browser.newPage();
  // Corrupt a delivered color-map fixture, then verify recovery after rebuilding it.
  const catalogPath = join(temp, "catalog.js");
  const goodCatalog = await readFile(catalogPath, "utf8");
  const data = JSON.parse(
    goodCatalog.slice("window.DCC_CATALOG=".length).trim().replace(/;$/, ""),
  );
  data.nodes["texture/efe1b8-lacquer"].data = "data:image/png;base64,broken";
  await writeFile(
    catalogPath,
    "window.DCC_CATALOG=" + JSON.stringify(data) + ";\n",
  );
  await page.goto("about:blank");
  await page.goto(
    pathToFileURL(join(temp, "index.html")).href +
      "#object/glasshouse/vermilion-koi",
  );
  await page.waitForFunction(
    () => document.querySelector("#viewer-status").dataset.state === "error",
  );
  assert.match(await page.locator("#viewer-status").innerText(), /color map/);
  // Restore the source bytes and reload: this fixture deliberately changed catalog data.
  await writeFile(catalogPath, goodCatalog);
  await page.reload();
  await ready();
  await unavailable.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return type === "webgl2" ? null : get.call(this, type, ...args);
    };
  });
  await unavailable.goto(url + "#object/glasshouse/vermilion-koi");
  await unavailable.waitForFunction(
    () =>
      document.querySelector("#viewer-status").dataset.state === "unavailable",
  );
  await unavailable.goto(url + "#material/efe1b8-lacquer");
  assert.equal(await unavailable.locator("#bindings li").count(), 5);
  await unavailable.close();
  // Delay the first scene script, then select another scene before it completes.
  const race = await browser.newPage();
  await race.addInitScript(() => {
    const append = Element.prototype.append;
    Element.prototype.append = function (...children) {
      if (
        children.some(
          (child) =>
            child.tagName === "SCRIPT" &&
            child.src.endsWith("/weather-station.js"),
        )
      ) {
        window.releaseGeometry = () => append.apply(this, children);
        return;
      }
      return append.apply(this, children);
    };
  });
  await race.goto(url + "#scene/weather-station");
  await race.waitForFunction(
    () => document.querySelector("#viewer-status").dataset.state === "loading",
  );
  await race.locator("#next").click();
  await race.waitForFunction(
    () => document.querySelector("#viewer-status").dataset.state === "ready",
  );
  const after = await race.locator("#model").screenshot();
  await race.evaluate(() => window.releaseGeometry());
  await race.waitForFunction(
    () => !document.querySelector('script[src="weather-station.js"]'),
  );
  await race.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  assert.equal(
    await race.locator("#asset-title").innerText(),
    "Glasshouse and koi pond",
  );
  assert.deepEqual(await race.locator("#model").screenshot(), after);
  await race.close();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: offline browse/inspect, URL filters, return focus, relationships, maps/rights, camera/UV/pointer/keyboard, empty and invalid routes, narrow/text reflow, missing-file retry, unavailable/context-loss recovery, stale-load protection.",
  );
} finally {
  await browser.close();
  await rm(temp, { recursive: true, force: true });
}
