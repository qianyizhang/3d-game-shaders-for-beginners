/** Bootstrap the independent compiler; publish only a fully checked build. */
import { spawnSync } from "node:child_process";
import { access, copyFile, mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const dcc = fileURLToPath(new URL("..", import.meta.url));
export async function build() {
  const compiler = join(dcc, "node_modules/typescript/bin/tsc");
  try {
    await access(compiler);
  } catch {
    throw new Error("DCC compiler missing. Run npm ci --prefix dcc.");
  }
  const parent = resolve(dcc, "../.local/dcc");
  await mkdir(parent, { recursive: true });
  const stage = await mkdtemp(join(parent, "compile-"));
  try {
    for (const [config, folder] of [
      ["tsconfig.json", "web"],
      ["tsconfig.tools.json", "tools"],
    ]) {
      const result = spawnSync(
        process.execPath,
        [
          compiler,
          "--project",
          join(dcc, config),
          "--outDir",
          join(stage, folder),
        ],
        { encoding: "utf8" },
      );
      if (result.status !== 0)
        throw new Error(
          (result.stdout + result.stderr).trim() ||
            "TypeScript compilation failed",
        );
    }
    for (const name of ["index.html", "style.css"])
      await copyFile(join(dcc, "web", name), join(stage, "web", name));
    const output = join(parent, "compiled"),
      previous = join(stage, "previous");
    let hadPrevious = false;
    try {
      await rename(output, previous);
      hadPrevious = true;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    try {
      await rename(stage, output);
    } catch (error) {
      if (hadPrevious) await rename(previous, output);
      throw error;
    }
    await rm(join(output, "previous"), { recursive: true, force: true });
    return output;
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    console.log(await build());
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
