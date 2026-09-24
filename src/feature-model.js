export function backupRecordFailed(record) {
  return record?.success===false || (typeof record?.exit_code==='number'&&record.exit_code!==0) || ['failed','failure','error','canceled','cancelled'].includes(String(record?.status||'').toLowerCase());
}
export function cleanOutput(value = "") {
  return value
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\r(?!\n)/g, "\n");
}
export function backupState(health, maxHours = 24, now = Date.now()) {
  const backup = health?.backup;
  if (!backup?.available)
    return {
      label: "Unavailable",
      attention: true,
      detail: backup?.error || "Refresh system health",
    };
  const record = backup.data?.jobs?.backup;
  if(backupRecordFailed(record))return {label:'Failed',attention:true,detail:'Latest backup record reports failure; inspect its logs.'};
  const date = Date.parse(record?.completed_at);
  if (!Number.isFinite(date))
    return {
      label: "Not recorded",
      attention: true,
      detail: "No successful backup recorded",
    };
  const hours = (now - date) / 3600000;
  return {
    label: hours < 1 ? "Less than an hour ago" : `${Math.floor(hours)}h ago`,
    attention: hours < 0 || hours > maxHours,
    detail:
      hours < 0
        ? "Backup timestamp is in the future"
        : hours > maxHours
          ? "Backup is overdue"
          : "Last recorded successful backup",
  };
}
export function attentionItems(repositories, jobs, health, maxHours) {
  const items = [];
  for (const repo of repositories)
    if (repo.status_error || repo.dirty || repo.ahead || repo.behind)
      items.push({
        id: `repo:${repo.path}`,
        title: repo.name,
        detail: repo.status_error
          ? "Git status unavailable"
          : `${repo.modified_files || 0} changed · ${repo.ahead || 0} ahead · ${repo.behind || 0} behind`,
        view: "repositories",
        path: repo.path,
      });
  for (const job of jobs)
    if (!["running", "succeeded"].includes(job.status) && !job.acknowledged)
      items.push({
        id: `job:${job.id}`,
        title: job.title,
        detail: `Job ${job.status}`,
        view: "activity",
        jobId: job.id,
      });
  if (health) {
    if (health.disk?.available) {
      for (const line of health.disk.output.split("\n").slice(1)) {
        const match = line.match(/\s(\d+)%\s+(.+)$/);
        if (
          match &&
          Number(match[1]) >= 90 &&
          !items.some((i) => i.id === `disk:${match[2]}`)
        )
          items.push({
            id: `disk:${match[2]}`,
            title: "Disk space running low",
            detail: `${match[2]} is ${match[1]}% full`,
            view: "health",
          });
      }
    }
    const b = backupState(health, maxHours);
    if (b.attention)
      items.push({
        id: "backup",
        title: "Backup needs attention",
        detail: b.detail,
        view: "backup",
      });
    for (const [key, label] of [
      ["userServices", "User services"],
      ["systemServices", "System services"],
    ]) {
      const service = health[key];
      if (service?.available && service.output.trim())
        items.push({
          id: key,
          title: `${label} have failures`,
          detail: service.output
            .trim()
            .split("\n")
            .map((l) => l.trim().split(/\s/)[0])
            .join(", "),
          view: "health",
        });
    }
  }
  return items;
}
export function filterProjects(repos, workspace, group, favorites) {
  return repos.filter(
    (repo) =>
      (!favorites || workspace[repo.path]?.favorite) &&
      (!group || workspace[repo.path]?.group === group),
  );
}
export function parseSnapshots(job) {
  if (job.truncated)
    throw new Error(
      "Snapshot result exceeded the output limit. Use Restic in your terminal to inspect it.",
    );
  const data = JSON.parse(job.result || job.output);
  if (!Array.isArray(data))
    throw new Error("Unexpected Restic snapshot response");
  return data.sort((a, b) => Date.parse(b.time) - Date.parse(a.time));
}
export function parseSnapshotFiles(job) {
  if (job.truncated)
    throw new Error(
      "Directory listing exceeded the output limit. Browse a smaller subdirectory.",
    );
  return (job.result || job.output)
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line))
    .filter((v) => v.struct_type === "node" || (v.path && v.type));
}
export function formatBytes(size) {
  if (typeof size !== "number" || !Number.isFinite(size) || size < 0) return "—";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let value = size;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${unit ? value.toFixed(1) : value} ${units[unit]}`;
}
// Groups a snapshot-find result by path, newest version first. A version is
// "changed" when its size or modification time differs from the next older one.
export function parseFileHistory(job) {
  let data;
  try {
    data = JSON.parse(job.result || job.output);
  } catch {
    throw new Error(
      "The search returned too many matches to read. Search a more specific path, for example ~/Documents/report.odt.",
    );
  }
  if (!Array.isArray(data?.snapshots) || !Array.isArray(data?.matches))
    throw new Error("Unexpected Restic search response");
  const snapshots = new Map(data.snapshots.map((s) => [s.id, s]));
  const paths = new Map();
  for (const hit of data.matches) {
    const snapshot = snapshots.get(hit.snapshot);
    if (!snapshot) continue;
    for (const match of hit.matches || []) {
      if (!paths.has(match.path)) paths.set(match.path, []);
      paths.get(match.path).push({
        snapshot: snapshot.id,
        shortId: snapshot.short_id || snapshot.id.slice(0, 8),
        time: snapshot.time,
        hostname: snapshot.hostname || "",
        type: match.type,
        size: typeof match.size === "number" ? match.size : null,
        mtime: match.mtime,
      });
    }
  }
  return [...paths]
    .map(([path, versions]) => {
      versions.sort((a, b) => Date.parse(b.time) - Date.parse(a.time));
      versions.forEach((version, index) => {
        const older = versions[index + 1];
        version.status = !older
          ? "first"
          : older.size !== version.size || older.mtime !== version.mtime
            ? "changed"
            : "same";
      });
      const newest = versions[0];
      // Newer snapshots of the same host and backup path that lack this file.
      const covers = (s) =>
        (s.hostname || "") === newest.hostname &&
        (s.paths || []).some((root) => {
          const base = root.replace(/\/+$/, "") || "/";
          return path === base || path.startsWith(base === "/" ? "/" : `${base}/`);
        });
      const missingFrom = data.snapshots.filter(
        (s) => covers(s) && Date.parse(s.time) > Date.parse(newest.time),
      ).length;
      return {
        path,
        type: newest.type,
        versions,
        distinct: versions.filter((v) => v.status !== "same").length,
        lastSeen: newest.time,
        missingFrom,
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}
