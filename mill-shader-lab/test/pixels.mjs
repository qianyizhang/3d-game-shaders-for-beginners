import assert from "node:assert/strict";

export async function pixelStats(page, first, second, { mask, threshold = 6 } = {}) {
  const url = png => png && `data:image/png;base64,${png.toString("base64")}`;
  return page.evaluate(async ({ sources, threshold }) => {
    let width, height;
    const decode = async source => {
      if (!source) return undefined;
      const image = new Image();
      image.src = source;
      await image.decode();
      width ??= image.naturalWidth;
      height ??= image.naturalHeight;
      if (width !== image.naturalWidth || height !== image.naturalHeight) {
        throw new Error("Pixel comparison needs matching image sizes");
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(image, 0, 0);
      return ctx.getImageData(0, 0, width, height).data;
    };
    // The hit-UV inspector encodes misses in rust and draws absent surfaces dark.
    const isMiss = (r, g, b) => r >= 80 && r <= 88 && g >= 31 && g <= 40 && b >= 27 && b <= 34;
    const a = await decode(sources[0]);
    const b = await decode(sources[1]);
    const m = await decode(sources[2]);
    let count = 0, sum = 0, peakError = 0, min = 255, max = 0, hits = 0, misses = 0, colored = 0;
    let inside = 0, outsideChanges = 0, missChanges = 0;
    for (let i = 0; i < a.length; i += 4) {
      const r = a[i], g = a[i+1], blue = a[i+2];
      const miss = isMiss(r, g, blue);
      min = Math.min(min, r);
      max = Math.max(max, r);
      if (miss) misses++;
      else if (blue > 13) hits++;
      if (r > 24 || g > 24 || blue > 24) colored++;
      if (m?.[i] > 10) inside++;
      if (!b) continue;
      const d = Math.abs(r - b[i]) + Math.abs(g - b[i+1]) + Math.abs(blue - b[i+2]);
      sum += d;
      peakError = Math.max(peakError, d);
      if (d <= threshold) continue;
      count++;
      if (m?.[i] <= 10) outsideChanges++;
      if (m && isMiss(m[i], m[i+1], m[i+2])) missChanges++;
    }
    return { count, peakError, mean: sum / (a.length * 0.75), min, max, hits, misses, colored, inside, outsideChanges, missChanges };
  }, { sources: [url(first), url(second), url(mask)], threshold });
}

export async function samePixels(page, a, b, message) {
  if (a.equals(b)) return;
  const { count, peakError } = await pixelStats(page, a, b, { threshold: 0 });
  assert.equal(count, 0, `${message} (peak RGB sum error: ${peakError})`);
}
