import { cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const project = dirname(dirname(fileURLToPath(import.meta.url)));
const output = join(project, "dist");

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(join(project, "index.html"), join(output, "index.html"));
await cp(join(project, "src"), join(output, "src"), { recursive: true });
console.log("Built static frontend in dist/.");
