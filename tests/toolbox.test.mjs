import test from "node:test";
import assert from "node:assert/strict";
import { filterTools, setupTools, taskLabels } from "../src/toolbox-model.js";
const actions = [
  {
    id: "fish",
    name: "Myfish Fish",
    description: "Native packages",
    category: "Applications Setup",
    groups: ["Myfish Shell Setup"],
    available: true,
  },
  {
    id: "config",
    name: "Ghostty config",
    description: "Back up files",
    category: "Applications Setup",
    groups: ["Dotfiles"],
    available: true,
  },
  {
    id: "discord",
    name: "Discord",
    description: "Communication",
    category: "Applications Setup",
    groups: ["Communication"],
    available: false,
  },
  {
    id: "disk",
    name: "Disk tools",
    description: "Partition disks",
    category: "Utilities",
    groups: [],
    available: true,
  },
];
test("tool search combines words, categories, availability and favorites", () => {
  assert.deepEqual(
    filterTools(actions, { query: "shell NATIVE" }).map((a) => a.id),
    ["fish"],
  );
  assert.deepEqual(
    filterTools(actions, {
      category: "Applications Setup",
      favorites: ["config", "disk"],
    }).map((a) => a.id),
    ["config"],
  );
  assert.equal(filterTools(actions).length, 3);
  assert.equal(filterTools(actions, { available: false }).length, 4);
  assert.deepEqual(filterTools(actions, { favorites: [] }), []);
});
test("quick setup keeps shell and dotfiles workflows separate from application installers", () => {
  assert.deepEqual(
    setupTools(actions, "myfish").map((a) => a.id),
    ["fish"],
  );
  assert.deepEqual(
    setupTools(actions, "dotfiles").map((a) => a.id),
    ["config"],
  );
  assert.deepEqual(
    setupTools(actions, "apps").map((a) => a.id),
    ["discord"],
  );
  assert.match(
    taskLabels("D FM MP"),
    /Disk changes.*File changes.*Package manager/,
  );
});
