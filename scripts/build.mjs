import { cp, mkdir } from "node:fs/promises";
import { build } from "esbuild";
const root = new URL("../", import.meta.url);
await mkdir(new URL("dist/src/", root), { recursive: true });
await cp(new URL("index.html", root), new URL("dist/index.html", root));
await cp(new URL("src/styles.css", root), new URL("dist/src/styles.css", root));
await cp(
  new URL("node_modules/@xterm/xterm/css/xterm.css", root),
  new URL("dist/src/xterm.css", root),
);
await cp(
  new URL("THIRD_PARTY.md", root),
  new URL("dist/src/THIRD_PARTY.md", root),
);
await build({
  entryPoints: [new URL("src/app.js", root).pathname],
  outfile: new URL("dist/src/app.js", root).pathname,
  bundle: true,
  format: "esm",
  target: "es2022",
  sourcemap: true,
});
console.log("Built Command Center in dist/.");
