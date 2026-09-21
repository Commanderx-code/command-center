import "./build.mjs";
import { createServer } from "node:http";
import { readFile, cp, watch } from "node:fs/promises";
import { extname, join } from "node:path";
import { context } from "esbuild";
const project = new URL("../", import.meta.url);
const root = new URL("dist/", project).pathname;
const port = Number(process.env.PORT || 4173);
const types = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".map": "application/json",
};
const bundler = await context({
  entryPoints: [new URL("src/app.js", project).pathname],
  outfile: join(root, "src/app.js"),
  bundle: true,
  format: "esm",
  target: "es2022",
  sourcemap: true,
});
await bundler.watch();
for (const file of ["index.html", "src/styles.css"])
  (async () => {
    for await (const _ of watch(new URL(file, project)))
      await cp(new URL(file, project), join(root, file));
  })().catch(console.error);
createServer(async (request, response) => {
  try {
    const path = decodeURIComponent(
      new URL(request.url, "http://localhost").pathname,
    );
    if (path.includes("..") || path.includes("\0"))
      throw new Error("Invalid path");
    const file = path === "/" ? "index.html" : path.slice(1);
    if (file !== "index.html" && !file.startsWith("src/"))
      throw new Error("Not found");
    const contents = await readFile(join(root, file));
    response.writeHead(200, {
      "content-type": `${types[extname(file)] || "application/octet-stream"}; charset=utf-8`,
      "cache-control": "no-store",
    });
    response.end(contents);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
}).listen(port, "127.0.0.1", () =>
  console.log(
    `Command Center preview: http://127.0.0.1:${port} (source changes rebuild; refresh the browser)`,
  ),
);
