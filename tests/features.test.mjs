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
  parseFileHistory,
  formatBytes,
  parseSnapshotFiles,
  cleanOutput,
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

test("file history groups versions by path, marks changes and detects deletion", () => {
  const snap = (id, time, host = "desk", paths = ["/home/me"]) => ({
    id: id.repeat(8), short_id: id.repeat(8).slice(0, 8), time, hostname: host, paths,
  });
  const file = (path, size, mtime) => ({ path, type: "file", size, mtime });
  const s1 = snap("a", "2026-09-01T10:00:00Z");
  const s2 = snap("b", "2026-09-02T10:00:00Z");
  const s3 = snap("c", "2026-09-03T10:00:00Z");
  const s4 = snap("d", "2026-09-04T10:00:00Z");
  const other = snap("e", "2026-09-05T10:00:00Z", "laptop");
  const result = JSON.stringify({
    snapshots: [s1, s2, s3, s4, other],
    matches: [
      { snapshot: s4.id, hits: 1, matches: [file("/home/me/sub/notes.txt", 2, "m0")] },
      { snapshot: s3.id, hits: 2, matches: [file("/home/me/notes.txt", 10, "m2"), file("/home/me/sub/notes.txt", 2, "m0")] },
      { snapshot: s2.id, hits: 2, matches: [file("/home/me/notes.txt", 10, "m2"), file("/home/me/sub/notes.txt", 2, "m0")] },
      { snapshot: s1.id, hits: 2, matches: [file("/home/me/notes.txt", 3, "m1"), file("/home/me/sub/notes.txt", 2, "m0")] },
    ],
  });
  const [notes, sub] = parseFileHistory({ result });
  assert.equal(notes.path, "/home/me/notes.txt");
  assert.deepEqual(notes.versions.map((v) => v.shortId), ["cccccccc", "bbbbbbbb", "aaaaaaaa"]);
  assert.deepEqual(notes.versions.map((v) => v.status), ["same", "changed", "first"]);
  assert.equal(notes.distinct, 2);
  // Deleted before snapshot d; the laptop's snapshot is another machine and ignored.
  assert.equal(notes.missingFrom, 1);
  assert.equal(sub.versions.length, 4);
  assert.equal(sub.distinct, 1);
  assert.equal(sub.missingFrom, 0);
  assert.deepEqual(parseFileHistory({ result: JSON.stringify({ snapshots: [s1], matches: [] }) }), []);
  assert.throws(() => parseFileHistory({ result: '{"snapshots":[' }), /more specific path/);
  assert.throws(() => parseFileHistory({ result: "[]" }), /Unexpected/);
});

test("byte sizes are human readable", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(1536), "1.5 KiB");
  assert.equal(formatBytes(5 * 1024 ** 3), "5.0 GiB");
  assert.equal(formatBytes(null), "—");
});

test("job output cleaning strips terminal sequences as before", () => {
  assert.equal(cleanOutput("a\x1b]0;title\x07b"), "ab");
  assert.equal(cleanOutput("a\x1b]0;title\x1b\\b"), "ab");
  assert.equal(cleanOutput("a\x1b]0;t\x1b\\visible\x07b"), "ab");
  assert.equal(cleanOutput("see \x1b]8;;https://example.com\x1b\\label\x1b]8;;\x1b\\ now"), "see  now");
  assert.equal(cleanOutput("a\x1b]0;broken\x1b]0;title\x07b"), "ab");
  assert.equal(cleanOutput("a\x1b]0;unterminated"), "a\x1b]0;unterminated");
  assert.equal(cleanOutput("\x1b[31mred\x1b[0m\rline\r\n"), "red\nline\r\n");
  assert.equal(cleanOutput(), "");
});

test("job output cleaning stays linear on unterminated OSC floods", () => {
  const flood = "\x1b]".repeat(1_000_000);
  const started = Date.now();
  assert.equal(cleanOutput(flood), flood);
  assert.ok(Date.now() - started < 2000);
});
