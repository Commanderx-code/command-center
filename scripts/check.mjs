import { readFile } from "node:fs/promises";

const files = ["index.html", "src/app.js", "src/styles.css", "src-tauri/tauri.conf.json", "src-tauri/Cargo.toml"];
for (const file of files) {
  const contents = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
  if (!contents.trim()) throw new Error(`${file} is empty`);
}
await import(new URL("../src/app.js", import.meta.url)).catch((error) => {
  if (!String(error).includes("window is not defined")) throw error;
});
JSON.parse(await readFile(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8"));
console.log(`Validated ${files.length} project files.`);
