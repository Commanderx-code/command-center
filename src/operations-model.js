export const stepTypes = {
  "backup-ready": "Check backup drive",
  backup: "Run personal backup",
  "restic-check": "Check Restic repository",
  "hm-build": "Build Home Manager",
  "hm-switch": "Apply Home Manager",
  "sync-fetch": "Fetch dotfiles",
  "sync-pull": "Pull dotfiles",
  fetch: "Fetch repository",
  "profile-clone": "Clone repository",
  toolbox: "Run Toolbox installer",
  custom: "Run saved quick action",
  "personal-tool": "Run personal tool",
  "tool-update": "Update packages",
  "health-check": "Check services and disk usage",
};
export function defaultCollection() {
  return {
    workflows: [],
    profiles: [],
    tools: [],
    notifications: {
      enabled: false,
      failures: true,
      completions: true,
      health: true,
      quietStart: 22,
      quietEnd: 7,
    },
  };
}
export function weeklyRecipe() {
  return {
    id: "weekly-maintenance",
    name: "Weekly maintenance",
    steps: ["backup-ready", "backup", "restic-check", "health-check"].map(
      (action) => ({
        name: stepTypes[action],
        request: { action },
        satisfiedPath: "",
      }),
    ),
  };
}
export function toolFolderItems(tools, folder, query = "") {
  const prefix = folder ? folder + "/" : "";
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const matching = tools.filter(
    (t) =>
      (t.folder === folder || t.folder.startsWith(prefix)) &&
      words.every((w) =>
        `${t.name} ${t.description} ${t.folder}`.toLowerCase().includes(w),
      ),
  );
  if (words.length) return { folders: [], tools: matching };
  return {
    folders: [
      ...new Set(
        matching
          .filter((t) => t.folder !== folder)
          .map((t) => prefix + t.folder.slice(prefix.length).split("/")[0]),
      ),
    ].sort(),
    tools: matching.filter((t) => t.folder === folder),
  };
}
export function advanceRun(run, job) {
  if (!run || run.jobId !== job.id || job.status === "running") return run;
  const rows = run.rows.map((r, i) =>
    i === run.index ? { ...r, status: job.status } : r,
  );
  const index = run.index + 1;
  return {
    ...run,
    rows,
    jobId: null,
    index: job.status === "succeeded" ? index : run.index,
    status:
      job.status !== "succeeded"
        ? "stopped"
        : index === rows.length
          ? "succeeded"
          : "ready",
  };
}
export function timelineFilter(rows, query, category) {
  const words = query.toLowerCase().trim().split(/\s+/);
  return rows.filter(
    (r) =>
      (!category || r.category === category) &&
      words.every((w) =>
        `${r.title} ${r.category} ${r.status} ${r.detail}`
          .toLowerCase()
          .includes(w),
      ),
  );
}

export function restoreRun(value) {
  if (
    !value ||
    typeof value.name !== "string" ||
    !Array.isArray(value.rows) ||
    !value.rows.length ||
    value.rows.length > 30 ||
    !Number.isInteger(value.index) ||
    value.index < 0 ||
    value.index > value.rows.length ||
    value.rows.some(
      (row) =>
        typeof row.name !== "string" ||
        typeof row.status !== "string" ||
        !row.request ||
        !stepTypes[row.request.action],
    )
  )
    return null;
  if (value.index === value.rows.length && value.status !== "succeeded")
    return null;
  return {
    ...value,
    jobId: null,
    status: ["succeeded", "stopped"].includes(value.status)
      ? value.status
      : "interrupted",
  };
}
