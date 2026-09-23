import test from "node:test";
import assert from "node:assert/strict";
import { mergeDetected } from "../src/setup-center.js";
import { normalize, normalizeIntegrations } from "../src/preferences.js";
test("setup detection preserves configured paths and completion survives preference migration", () => {
  const current = normalizeIntegrations({
    dotfilesPath: "/configured",
    resticRepository: "/local",
  });
  const merged = mergeDetected(current, {
    dotfilesPath: "/detected",
    backupScript: "/helper",
    resticRepository: "",
  });
  assert.equal(merged.dotfilesPath, "/configured");
  assert.equal(merged.backupScript, "/helper");
  assert.equal(merged.resticRepository, "/local");
  assert.equal(normalize({}).setupCompleted, false);
  assert.equal(normalize({ setupCompleted: true }).setupCompleted, true);
});
