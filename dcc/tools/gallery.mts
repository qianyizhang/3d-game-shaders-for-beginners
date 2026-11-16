import { copyFile, mkdir, readdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseInput } from "./input.mjs";
import { project } from "./catalog.mjs";
const raw = readFileSync(0, "utf8");
const input = parseInput(JSON.parse(raw));
const { catalog, outputs } = project(input);
const web = fileURLToPath(new URL("../web/", import.meta.url));
const webFiles = await readdir(web);
const catalogFile = "catalog.js";
for (const name of [...webFiles, catalogFile]) {
  if (outputs.has(name)) throw new Error(`Gallery output collision: ${name}`);
}
// Complete projection and check output names before touching the destination.
await mkdir(join(input.output, "textures"), { recursive: true });
for (const [name, payload] of outputs)
  await writeFile(join(input.output, name), payload);
for (const name of webFiles)
  await copyFile(join(web, name), join(input.output, name));
await writeFile(
  join(input.output, catalogFile),
  "window.DCC_CATALOG=" + JSON.stringify(catalog) + ";\n",
);
console.log(
  `Built catalog for ${Object.keys(catalog.scenes).length} scene(s), ${Object.keys(catalog.nodes).length} records at ${join(input.output, "index.html")}`,
);
