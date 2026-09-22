import test from "node:test";
import assert from "node:assert/strict";
import {
  advanceRun,
  toolFolderItems,
  timelineFilter,
  weeklyRecipe,
} from "../src/operations-model.js";
test("workflow advances only on its own successful job and stops on failures", () => {
  const current = {
    index: 0,
    status: "running",
    jobId: "one",
    rows: [
      { name: "Backup", status: "running" },
      { name: "Update", status: "pending" },
    ],
  };
  assert.equal(
    advanceRun(current, { id: "other", status: "succeeded" }),
    current,
  );
  const next = advanceRun(current, { id: "one", status: "succeeded" });
  assert.equal(next.index, 1);
  assert.equal(next.status, "ready");
  assert.equal(next.jobId, null);
  for (const status of ["failed", "cancelled", "interrupted", "timed_out"]) {
    const failed = advanceRun(current, { id: "one", status });
    assert.equal(failed.index, 0);
    assert.equal(failed.status, "stopped");
    assert.equal(failed.rows[1].status, "pending");
  }
  assert.equal(
    advanceRun({ ...current, index: 1 }, { id: "one", status: "succeeded" })
      .status,
    "succeeded",
  );
});
test("personal folders show children and scope search to descendants", () => {
  const tools = [
    { name: "Backup", description: "Restic", folder: "Maintenance/Backups" },
    { name: "Check", description: "Services", folder: "Maintenance" },
    { name: "Other", description: "Restic", folder: "Other" },
  ];
  assert.deepEqual(toolFolderItems(tools, "Maintenance").folders, [
    "Maintenance/Backups",
  ]);
  assert.equal(toolFolderItems(tools, "Maintenance").tools[0].name, "Check");
  assert.deepEqual(
    toolFolderItems(tools, "Maintenance", "restic").tools.map((t) => t.name),
    ["Backup"],
  );
});
test("timeline combines word and category filters", () => {
  const rows = [
    {
      title: "Backup complete",
      category: "backup",
      status: "succeeded",
      detail: "/home/test",
    },
    {
      title: "Backup helper",
      category: "custom",
      status: "failed",
      detail: "/home/test",
    },
  ];
  assert.equal(timelineFilter(rows, "backup succeeded", "backup").length, 1);
  assert.equal(timelineFilter(rows, "failed", "backup").length, 0);
});
test("starter workflow checks readiness before backup and contains no unattended update", () => {
  assert.deepEqual(
    weeklyRecipe().steps.map((s) => s.request.action),
    ["backup-ready", "backup", "restic-check", "health-check"],
  );
});
