import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { preview } from "vite";

export async function withLab(run) {
  const server = await preview({ preview: { host: "127.0.0.1", port: 0, strictPort: true, open: false } });
  try {
    const address = server.httpServer.address();
    assert.ok(address && typeof address === "object", "Expected a loopback preview address");
    const base = new URL(`http://127.0.0.1:${address.port}/`);
    const browser = await chromium.launch(process.env.CI
      ? { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] }
      : { channel: "chrome" });
    try {
      const external = new Set();
      const context = async options => {
        const context = await browser.newContext({
          viewport: { width: 1612, height: 1150 }, deviceScaleFactor: 1, ...options, serviceWorkers: "block",
        });
        context.setDefaultTimeout(15000);
        await context.route("**/*", route => {
          const url = new URL(route.request().url());
          if (url.origin === base.origin) return route.continue();
          external.add(url.href);
          return route.abort();
        });
        return context;
      };
      await run({ base, context });
      assert.deepEqual([...external], [], "The lab must run from loopback assets alone");
    } finally {
      await browser.close();
    }
  } finally {
    await server.close();
  }
}

export function watchErrors(page) {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("requestfailed", request => errors.push(`${request.failure()?.errorText} ${request.url()}`));
  page.on("response", response => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
  });
  return () => assert.deepEqual(errors, [], "Unexpected browser, WebGL or asset errors");
}

export function labPage(page) {
  const $ = id => page.locator("#" + id);
  const choose = (id, value) => $(id).selectOption(String(value));
  const check = (id, value) => $(id).setChecked(value);
  const click = name => page.getByRole("button", { name, exact: true }).click();
  const stable = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const ready = async () => {
    await page.locator("#workbench:visible, #fallback:visible").waitFor();
    await stable();
    assert.ok(await $("scene").isVisible(), await $("failure").textContent());
  };
  const shot = async ({ path, size } = {}) => {
    await page.evaluate(() => scrollTo(0, 0));
    await ready();
    const style = ".viewport { border-radius: 0 !important; } .viewport-tag, #focus-marker { visibility: hidden !important; }";
    if (!size) return $("scene").screenshot({ path, style });
    const bounds = await $("scene").boundingBox();
    assert.ok(bounds);
    assert.deepEqual(await $("scene").evaluate(canvas => [canvas.width, canvas.height]), size);
    const [width, height] = size;
    return page.screenshot({
      clip: { x: Math.round(bounds.x), y: Math.round(bounds.y), width, height }, path, style,
    });
  };
  const control = async (key, value) => {
    const local = $(key);
    const input = await local.count() ? local : $("fx-" + key);
    await input.evaluate((element, value) => {
      if (element.type === "checkbox") {
        element.checked = Boolean(value);
        element.dispatchEvent(new Event("change", { bubbles: true }));
      } else {
        element.value = String(value);
        if (element.value !== String(value)) throw new Error("Invalid control value: " + element.id);
        element.dispatchEvent(new Event(element.type === "range" ? "input" : "change", { bubbles: true }));
      }
    }, value);
  };
  const reveal = async id => {
    if (!await $(id).evaluate(details => details.open)) await $(id).locator("summary").click();
  };
  const open = async id => {
    // Re-selecting the current value won't fire change in the browser.
    if (await $("lesson").inputValue() === id) await $("reset").click();
    else await choose("lesson", id);
  };
  const side = value => $("side-" + value).click();
  const view = async name => { await choose("buffer", name); return shot(); };
  return { $, page, choose, check, click, control, reveal, open, ready, side, shot, stable, view };
}
