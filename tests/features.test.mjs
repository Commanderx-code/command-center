import test from "node:test";
import assert from "node:assert/strict";
import { normalize } from "../src/preferences.js";
import {
  updateGhostty,
  ghosttyValues,
  parseFastfetch,
  editFastfetch,
} from "../src/config-controls.js";
import {
  backupState,
  attentionItems,
  filterProjects,
  parseSnapshots,
  parseSnapshotFiles,
} from "../src/feature-model.js";

test("integration preferences survive migration and retain explicit paths", () => {
  const prefs = normalize({
    editor: "kate",
    integrations: {
      dotfilesPath: "~/dotfiles",
      walletEntry: "Restic",
      backupMaxHours: 48,
    },
  });
  assert.equal(prefs.editor, "kate");
  assert.equal(prefs.integrations.backupMaxHours, 48);
  assert.equal(prefs.integrations.walletEntry, "Restic");
  assert.equal(normalize({}).integrations.backupMaxHours, 24);
});
test("Ghostty edits retain comments and unrelated settings and collapse duplicate overrides", () => {
  const original =
    "# personal theme\nfont-size = 10\nkeybind = ctrl+a=select_all\nfont-size = 12\n";
  const next = updateGhostty(original, { "font-size": "14" });
  assert.equal(ghosttyValues(next)["font-size"], "14");
  assert.equal(next.match(/font-size/g).length, 1);
  assert.match(next, /# personal theme/);
  assert.match(next, /keybind = ctrl\+a=select_all/);
  assert.throws(() =>
    updateGhostty(original, { "font-size": "12\ncommand = something" }),
  );
});
test("Fastfetch property edits preserve JSONC comments and custom module settings", () => {
  const content =
    '{\n // Keep this explanation\n "logo":{"source":"arch","width":24},\n "modules":[{"type":"os","key":"Distro"},{"type":"command","text":"custom-script"}],\n}';
  const next = editFastfetch(content, ["logo", "source"], "garuda");
  assert.match(next, /Keep this explanation/);
  const data = parseFastfetch(next);
  assert.equal(data.logo.width, 24);
  assert.equal(data.modules[1].text, "custom-script");
  assert.equal(data.logo.source, "garuda");
  assert.throws(() => parseFastfetch("{oops}"));
});
test("attention combines dirty and unpushed repos, failed jobs and backup age without hiding unknowns", () => {
  const now = Date.parse("2026-09-21T12:00:00Z");
  const health = {
    backup: {
      available: true,
      data: { jobs: { backup: { completed_at: "2026-09-19T12:00:00Z" } } },
    },
  };
  assert.equal(backupState(health, 24, now).attention, true);
  assert.equal(backupState(health, 72, now).attention, false);
  assert.equal(backupState({ backup: { available: false } }).attention, true);
  const items = attentionItems(
    [{ path: "/repo", name: "Repo", ahead: 1 }],
    [
      { id: "bad", title: "Backup", status: "failed" },
      { id: "reviewed", status: "failed", acknowledged: true },
    ],
    null,
    24,
  );
  assert.equal(items.length, 2);
  assert.equal(items[1].jobId, "bad");
});
test("project grouping and favorites compose", () => {
  const repos = [{ path: "/a" }, { path: "/b" }, { path: "/c" }];
  const metadata = {
    "/a": { group: "System", favorite: true },
    "/b": { group: "System" },
    "/c": { favorite: true },
  };
  assert.deepEqual(filterProjects(repos, metadata, "System", true), [
    { path: "/a" },
  ]);
  assert.equal(repos.length, 3);
});
test("backup results reject truncation and distinguish snapshot headers from file nodes", () => {
  assert.throws(() => parseSnapshots({ truncated: true, output: "[]" }));
  assert.equal(
    parseSnapshots({
      output:
        '[{"id":"new","time":"2026-09-20"},{"id":"old","time":"2026-09-19"}]',
    })[0].id,
    "new",
  );
  const nodes = parseSnapshotFiles({
    output:
      '{"struct_type":"snapshot","id":"abc"}\n{"struct_type":"node","path":"/home","type":"dir"}\n',
  });
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].path, "/home");
});
