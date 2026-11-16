/** Keep compiler startup out of Python's verified-delivery policy. */
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { build } from "./build-web.mjs";
try {
  const output = await build();
  const result = spawnSync(
    process.execPath,
    [join(output, "tools/gallery.mjs")],
    { stdio: "inherit" },
  );
  process.exitCode = result.status ?? 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
