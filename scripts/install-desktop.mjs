import {
  copyFile,
  mkdir,
  readFile,
  writeFile,
  chmod,
  rename,
} from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
const home = process.env.COMMAND_CENTER_INSTALL_HOME || homedir();
const root = new URL("../", import.meta.url);
if (process.platform !== "linux")
  throw new Error("Desktop installation currently supports Linux.");
const binary = new URL("src-tauri/target/release/command-center", root);
await readFile(binary);
const bin = join(home, ".local", "bin");
const apps = join(home, ".local", "share", "applications");
const icons = join(
  home,
  ".local",
  "share",
  "icons",
  "hicolor",
  "scalable",
  "apps",
);
await Promise.all(
  [bin, apps, icons].map((path) => mkdir(path, { recursive: true })),
);
const target = join(bin, "command-center");
try {
  await copyFile(target, target + ".previous");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
await copyFile(binary, target + ".new");
await chmod(target + ".new", 0o755);
await rename(target + ".new", target);
await copyFile(
  new URL("src-tauri/icons/command-center.svg", root),
  join(icons, "io.helixstack.commandcenter.svg"),
);
let desktop = await readFile(
  new URL("packaging/io.helixstack.commandcenter.desktop", root),
  "utf8",
);
const escaped = target.replace(/([\\"`$])/g, "\\$1").replace(/%/g, "%%");
desktop = desktop.replace("Exec=command-center", `Exec="${escaped}"`);
await writeFile(join(apps, "io.helixstack.commandcenter.desktop"), desktop);
spawnSync("update-desktop-database", [apps], { stdio: "ignore" });
console.log(
  `Installed ${target}\nOpen “Command Center” from your application menu.`,
);
