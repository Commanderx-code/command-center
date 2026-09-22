import { readFile, readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
const root = new URL("../", import.meta.url);
for (const directory of ["src", "scripts"])
  for (const name of await readdir(new URL(directory + "/", root))) {
    if (!/\.m?js$/.test(name)) continue;
    const result = spawnSync(
      process.execPath,
      ["--check", new URL(`${directory}/${name}`, root).pathname],
      { encoding: "utf8" },
    );
    if (result.status !== 0) throw new Error(result.stderr);
  }
const pkg = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
const config = JSON.parse(
  await readFile(new URL("src-tauri/tauri.conf.json", root), "utf8"),
);
if (pkg.version !== config.version)
  throw new Error("Frontend and desktop versions differ");
console.log(
  "JavaScript syntax, desktop configuration and version checks passed.",
);

const cargo = await readFile(new URL("src-tauri/Cargo.toml", root), "utf8");
if (cargo.match(/\[package\][\s\S]*?\nversion = "([^"]+)"/)?.[1] !== pkg.version)
  throw new Error("Cargo and frontend versions differ");
const toolbox = await readFile(
  new URL("src-tauri/src/toolbox.rs", root),
  "utf8",
);
const pinned = cargo.match(/linutil_core[^\n]+rev = "([a-f0-9]+)"/)?.[1];
const reported = toolbox.match(/REVISION: &str = "([a-f0-9]+)"/)?.[1];
if (!pinned || pinned !== reported)
  throw new Error("Toolbox revision must match the pinned core dependency");
