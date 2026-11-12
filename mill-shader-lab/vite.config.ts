import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Connect } from "vite";

const assets = fileURLToPath(new URL("../.local/mill-assets", import.meta.url));
const types: Record<string, string> = {
  ".json": "application/json", ".bin": "application/octet-stream",
  ".png": "image/png", ".ogg": "audio/ogg",
};

// Only the local server mounts the original art. Vite never copies it to dist.
const mount: Connect.NextHandleFunction = (req, res, next) => {
  if (!req.url?.startsWith("/mill-assets/")) return next();
  const key = req.url.slice(13).split("?")[0] ?? "";
  const path = resolve(assets, key);
  const mime = types[extname(path)];
  if (!path.startsWith(assets + sep) || !/^[\w./-]+$/.test(key) || !mime) {
    res.writeHead(404).end();
    return;
  }
  void stat(path).then(info => {
    if (!info.isFile()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { "Content-Type": mime, "Content-Length": info.size, "Cache-Control": "no-cache" });
    if (req.method === "HEAD") { res.end(); return; }
    createReadStream(path).on("error", () => res.destroy()).pipe(res);
  }, () => res.writeHead(404).end());
};

export default defineConfig({
  base: "./",
  publicDir: false,
  plugins: [{
    name: "local-original-mill",
    configureServer(server) { server.middlewares.use(mount); },
    configurePreviewServer(server) { server.middlewares.use(mount); },
  }],
});
