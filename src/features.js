import { createSystemWorkflows } from "./system-workflows.js";
import { createConfigHistory } from "./config-history.js";
import { renderBackupOverview } from "./backup-overview.js";
import { mountGitControls } from "./git-controls.js";
import { createToolbox } from "./toolbox.js";
import { normalizeIntegrations, integrationDefaults } from "./preferences.js";
import {
  ghosttyFields,
  ghosttyValues,
  updateGhostty,
  parseFastfetch,
  editFastfetch,
  moduleType,
} from "./config-controls.js";
import {
  cleanOutput,
  backupState,
  attentionItems,
  filterProjects,
  parseSnapshots,
  parseSnapshotFiles,
} from "./feature-model.js";
const integrationFields = [
  [
    "dotfilesPath",
    "Dotfiles repository",
    "Folder containing your Home Manager flake",
  ],
  ["flakeProfile", "Home Manager profile", "For example: commander"],
  ["backupScript", "Personal backup helper", "Executable path"],
  [
    "fullBackupScript",
    "Full backup helper",
    "Runs in your terminal for encryption prompts",
  ],
  ["backupHealthScript", "Backup health helper", "Must support --json"],
  [
    "resticRepository",
    "Restic repository",
    "Local path or Restic repository address",
  ],
  [
    "resticPasswordFile",
    "Restic password file",
    "Optional; otherwise use KWallet or inherited environment",
  ],
  ["wallet", "KWallet name", "Wallet identifier, not a password"],
  ["walletFolder", "KWallet folder", "Folder containing your Restic entry"],
  ["walletEntry", "KWallet entry", "Name of your Restic credential"],
  [
    "ghosttySource",
    "Ghostty source file",
    "Editable config, never a Nix store path",
  ],
  [
    "fastfetchSource",
    "Fastfetch source file",
    "Use the dotfiles source when Home Manager owns the live file",
  ],
  [
    "secretsDirectory",
    "Encrypted recovery folder",
    "Checks for .gpg / .age files without opening them",
  ],
  [
    "recoveryNotesPath",
    "Recovery instructions",
    "Path to your recovery document",
  ],
  [
    "backupMaxHours",
    "Backup freshness (hours)",
    "When a recorded backup becomes overdue",
  ],
];
const button = (text, attrs = "", primary = false) =>
  `<button type="button" class="${primary ? "primary" : "secondary"}-button" ${attrs}>${text}</button>`;
const head = (eyebrow, title, copy, actions = "") =>
  `<div class="module-heading"><div><p class="eyebrow">${eyebrow}</p><h2>${title}</h2><p>${copy}</p></div><div class="button-row">${actions}</div></div>`;
const empty = (text) => `<p class="module-empty">${text}</p>`;
export function createFeatures(api) {
  const {
    state,
    $,
    $$,
    escapeHtml: e,
    toast,
    switchView,
    loadRepositories,
    renderRepositoryGrid,
  } = api;
  const invoke = window.__TAURI__?.core?.invoke;
  let workspace = {},
    jobs = [],
    health = null,
    selectedJob = null,
    selectedRepo = null,
    configDocument = null,
    configKind = "ghostty";
  let snapshots = [],
    snapshotId = "",
    snapshotDirectory = "/",
    fileRows = [],
    favoritesOnly = false,
    group = "",
    polling = false,
    healthBusy = false,
    detailVersion = 0,
    configVersion = 0;
  let gitControls;
  const commitDrafts = new Map();
  const callbacks = new Map(),
    completed = new Set();
  const run = async (command, args = {}) => {
    if (!state.desktop)
      throw new Error(
        "This action requires the desktop app. Browser preview does not change your system.",
      );
    return invoke(command, args);
  };
  const guard = (fn) => async (event) => {
    try {
      await fn(event);
    } catch (error) {
      toast(String(error.message || error), true);
    }
  };
  const age = (time) => (time ? new Date(time).toLocaleString() : "—");
  function mount() {
    $(".main-nav").insertAdjacentHTML(
      "beforeend",
      `<button class="nav-item" data-view="attention"><span>!</span>Needs attention <em id="attention-count">0</em></button><button class="nav-item" data-view="activity"><span>≡</span>Activity <em id="activity-count">0</em></button>`,
    );
    const main = $("main");
    main.insertAdjacentHTML(
      "beforeend",
      `
     <section id="sync-view" class="view">${head("Declarative configuration", "System Sync", "Inspect your dotfiles, build your configuration, then apply it.", button("Refresh", 'id="sync-refresh"'))}
       <div class="panel module-panel"><div class="button-row">${button("Fetch", 'data-job="sync-fetch"')}${button("Pull updates", 'data-job="sync-pull"')}${button("Build configuration", 'data-job="hm-build"')}${button("Apply Home Manager", 'data-job="hm-switch"', true)}</div><p class="settings-help">Pull requires a clean working tree and uses fast-forward only. Build validates without activating. Apply changes your managed files and services.</p><div id="sync-status">${empty("Loading configuration status…")}</div></div>
     </section>
     <section id="backup-view" class="view">${head("Protect & recover", "Backup & Restore", "Your existing backup workflow, with snapshots and recovery checks in one place.", button("Refresh health", "data-health-refresh"))}
       <div id="backup-summary" class="status-strip">Refresh health to read local backup records.</div>
       <div class="panel module-panel"><div class="button-row">${button("Personal backup", 'data-job="backup"', true)}${button("Full recovery backup", 'data-job="backup-full"')}${button("Check repository", 'data-job="restic-check"')}${button("Load snapshots", 'id="load-snapshots"')}</div><p class="settings-help">Full backup opens your terminal for encryption prompts. Backup helpers use their own machine settings. The Restic fields in Settings control snapshot browsing and restores. Snapshot browsing can ask KWallet to unlock. Checks verify repository metadata; recovery checks below do not prove a backup is restorable.</p></div>
       <div class="module-columns"><section class="panel module-panel"><h3>Snapshots</h3><div id="snapshots">${empty("Load snapshots to browse your backup repository.")}</div></section>
       <section class="panel module-panel"><h3>Snapshot browser</h3><div class="button-row"><input id="snapshot-directory" aria-label="Snapshot directory" value="/">${button("Browse", 'id="browse-snapshot"')}</div><div id="snapshot-files">${empty("Select a snapshot first.")}</div>
       <form id="restore-form" class="stack-form"><label>Selected snapshot<input id="restore-snapshot" readonly></label><label>Include path or pattern <small>Blank restores the whole snapshot. Restic patterns may match multiple files.</small><input id="restore-include" placeholder="/home/commander/Documents"></label><label>New destination folder <small>Must be a new folder beneath your home; its parent must exist.</small><input id="restore-target" required placeholder="~/Restore-2026-09-21"></label><button class="primary-button" type="submit">Review restore</button></form></section></div>
       <section class="panel module-panel"><div class="panel-heading"><h3>Recovery readiness</h3>${button("Read recovery instructions", 'id="read-recovery"')}</div><div id="recovery-checks">${empty("Refresh health to check available recovery files.")}</div><pre id="recovery-notes" class="output" hidden></pre></section>
     </section>
     <section id="config-view" class="view">${head("Make it yours", "Configuration", "Edit the source, preview your changes, and keep a backup of the previous version.")}
       <div class="toolbar panel"><label>Application <select id="config-kind"><option value="ghostty">Ghostty</option><option value="fastfetch">Fastfetch</option></select></label>${button("Reload file", 'id="config-reload"')}<span id="config-state" role="status">Choose an application</span></div>
       <p id="config-source" class="status-strip"></p><div class="module-columns"><section class="panel module-panel"><h3>Controls</h3><div id="config-controls"></div><h3>Preview</h3><p class="settings-help">Illustrative preview. No terminal commands or Fastfetch command modules are executed.</p><pre id="config-preview" class="terminal-preview"></pre></section>
       <section class="panel module-panel"><label for="config-text"><strong>Source configuration</strong></label><textarea id="config-text" class="code-editor" spellcheck="false" aria-label="Source configuration"></textarea><div class="button-row">${button("Refresh controls", 'id="config-controls-refresh"')}${button("Validate", 'id="config-validate"')}${button("Review & save", 'id="config-save"', true)}</div><p id="config-feedback" role="status" class="settings-help">Load a file to begin.</p></section></div>
     </section>
     <section id="health-view" class="view">${head("Local diagnostics", "System Health", "Live local checks, with unavailable data clearly marked.", button("Refresh checks", "data-health-refresh"))}<p id="health-time" class="settings-help"></p><div id="health-panels" class="module-columns">${empty("Loading local checks…")}</div></section>
     <section id="attention-view" class="view">${head("Your next actions", "Needs attention", "Unpushed work, changed repositories, backup freshness, and failed jobs.")}<div id="attention-items" class="panel module-panel"></div></section>
     <section id="activity-view" class="view">${head("Operation history", "Activity", "Live output and the last 100 jobs, stored on this device.", button("Refresh", 'id="activity-refresh"'))}<p id="activity-error" role="status" class="error-text"></p><div class="activity-layout"><div id="job-list" class="panel module-panel"></div><section id="job-detail" class="panel module-panel">${empty("Select a job to inspect its command and output.")}</section></div></section>
   `,
    );
    $("#dashboard-view").insertAdjacentHTML(
      "beforeend",
      `<section class="panel module-panel attention-dashboard"><div class="panel-heading"><div><p class="eyebrow">Stay on top of things</p><h3>Needs attention</h3></div>${button("View all", 'data-feature-view="attention"')}</div><div id="dashboard-attention"></div></section>`,
    );
    renderBackupOverview({ target: $("#backup-summary"), health: null, integrations: state.settings.integrations, escapeHtml:e, desktop:state.desktop });
    const statCards = $$(".stats-grid .stat-card");
    for (const [index, id] of [
      [1, "sync"],
      [2, "backup"],
      [3, "health"],
    ]) {
      statCards[index].querySelector("strong").id = `stat-${id}`;
      statCards[index].querySelector("span").id = `stat-${id}-detail`;
    }
    $('[data-action="backup"] small').textContent = "Personal & full recovery";
    $('[data-action="home-manager"] small').textContent =
      "Build & apply configuration";
    $("#repo-filter").insertAdjacentHTML(
      "afterend",
      '<select id="repo-group" aria-label="Repository group"><option value="">All groups</option></select>',
    );
    $("#add-root-button").insertAdjacentHTML(
      "beforebegin",
      button("☆ Favorites", 'id="favorites-filter" aria-pressed="false"'),
    );
    $("#section-repositories").insertAdjacentHTML(
      "afterend",
      `<section id="section-integrations" class="panel settings-section integration-section"><div class="section-title"><span>05</span><div><h3>System integrations</h3><p>Use your installed helpers and editable configuration sources.</p></div></div><div class="button-row">${button("Detect existing setup", 'id="detect-integrations"')}${button("Check availability", 'id="check-integrations"')}</div><p id="integration-check-status" role="status">Check paths and tools using the values below.</p><div id="integration-check-results"></div>${integrationFields.map(([key, label, help]) => `<label class="integration-field" for="integration-${key}"><span>${label}<small>${help}</small></span><input id="integration-${key}" ${key === "backupMaxHours" ? 'type="number" min="1" max="8760"' : 'type="text"'} autocomplete="off"></label>`).join("")}<p class="settings-help">Credential fields identify an existing wallet entry or password file. Command Center does not ask for or store your backup password.</p></section>`,
    );
    $(".settings-links").insertAdjacentHTML(
      "beforeend",
      '<a href="#section-integrations">Integrations</a>',
    );
    document.body.insertAdjacentHTML(
      "beforeend",
      `<dialog id="repo-detail-dialog" class="wide-dialog" aria-labelledby="repo-detail-title"><div class="dialog-card"><div class="dialog-heading"><div><p class="eyebrow">Repository</p><h2 id="repo-detail-title">Details</h2></div>${button("Close", 'data-close="repo-detail-dialog"')}</div><div id="repo-details"></div></div></dialog>
   <dialog id="review-dialog" class="wide-dialog" aria-labelledby="review-title"><form id="review-form" class="dialog-card"><div class="dialog-heading"><div><p class="eyebrow">Review action</p><h2 id="review-title"></h2></div>${button("Cancel", 'id="review-cancel"')}</div><p id="review-description"></p><pre id="review-content" class="output"></pre><div class="dialog-actions"><button type="submit" class="primary-button" id="review-confirm">Run action</button></div></form></dialog>`,
    );
    bind();
  }
  let reviewResolve = null;
  function review(title, description, content, confirm = "Run action") {
    if (reviewResolve) reviewResolve(false);
    $("#review-title").textContent = title;
    $("#review-description").textContent = description;
    $("#review-content").textContent = content;
    $("#review-confirm").textContent = confirm;
    if (!$("#review-dialog").open) $("#review-dialog").showModal();
    return new Promise((resolve) => {
      reviewResolve = resolve;
    });
  }
  function resolveReview(accepted) {
    $("#review-dialog").close();
    const resolve = reviewResolve;
    reviewResolve = null;
    resolve?.(accepted);
  }
  async function action(request, callback) {
    const plan = await run("prepare_job", { request });
    const command = [plan.program, ...plan.args]
      .map((v) => JSON.stringify(v))
      .join(" ");
    if (
      !(await review(
        plan.title,
        plan.explanation,
        `Working directory: ${plan.cwd}\n\n${command}`,
      ))
    )
      return;
    const id = await run("start_job", { id: plan.id });
    selectedJob = id;
    if (callback) callbacks.set(id, callback);
    toast(`${plan.title} started`);
    if (!callback) switchView("activity");
    await poll();
    if (plan.interactive && !plan.externalTerminal) toolbox.started(id, plan);
    return id;
  }
  function bind() {
    document.addEventListener(
      "click",
      guard(async (event) => {
        const btn = event.target.closest("button");
        if (!btn) return;
        if (btn.dataset.job) await action({ action: btn.dataset.job });
        if (btn.hasAttribute("data-health-refresh")) await refreshHealth();
        if (btn.dataset.close) $("#" + btn.dataset.close).close();
        if (btn.dataset.featureView) switchView(btn.dataset.featureView);
      }),
    );
    $("#review-form").addEventListener("submit", (event) => {
      event.preventDefault();
      resolveReview(true);
    });
    $("#review-cancel").addEventListener("click", () => resolveReview(false));
    $("#review-dialog").addEventListener("cancel", (event) => {
      event.preventDefault();
      resolveReview(false);
    });
    $("#sync-refresh").addEventListener("click", guard(refreshSync));
    $("#activity-refresh").addEventListener("click", guard(poll));
    $("#detect-integrations").addEventListener(
      "click",
      guard(async () => {
        const found = await run("detect_integrations");
        populateIntegrations({
          ...readIntegrations(),
          ...Object.fromEntries(
            Object.entries(found).filter(([, v]) => v !== ""),
          ),
        });
        $("#preferences-form").dispatchEvent(new Event("input"));
        toast("Detected setup. Review the fields and Save settings.");
      }),
    );
    $("#repo-group").addEventListener("change", (event) => {
      group = event.target.value;
      renderRepositoryGrid();
    });
    $("#favorites-filter").addEventListener("click", () => {
      favoritesOnly = !favoritesOnly;
      $("#favorites-filter").setAttribute(
        "aria-pressed",
        String(favoritesOnly),
      );
      renderRepositoryGrid();
    });
    $("#load-snapshots").addEventListener(
      "click",
      guard(() =>
        action({ action: "snapshots" }, (job) => {
          snapshots = parseSnapshots(job);
          renderSnapshots();
        }),
      ),
    );
    $("#browse-snapshot").addEventListener(
      "click",
      guard(() => browseSnapshot($("#snapshot-directory").value)),
    );
    $("#restore-form").addEventListener(
      "submit",
      guard(async (event) => {
        event.preventDefault();
        if (!snapshotId) throw new Error("Select a snapshot first");
        await action({
          action: "restore",
          snapshot: snapshotId,
          target: $("#restore-target").value,
          include: $("#restore-include").value,
        });
      }),
    );
    $("#read-recovery").addEventListener(
      "click",
      guard(async () => {
        const text = await run("recovery_notes");
        $("#recovery-notes").textContent = text;
        $("#recovery-notes").hidden = false;
      }),
    );
    $("#config-kind").addEventListener(
      "change",
      guard(async (event) => {
        if (
          configDocument &&
          $("#config-text").value !== configDocument.content &&
          !(await review(
            "Discard unsaved edits?",
            "Switching applications reloads the selected source file.",
            "Your current draft has not been saved.",
            "Discard draft",
          ))
        ) {
          event.target.value = configKind;
          return;
        }
        configKind = event.target.value;
        await loadConfig();
      }),
    );
    $("#config-reload").addEventListener(
      "click",
      guard(async () => {
        if (
          configDocument &&
          $("#config-text").value !== configDocument.content &&
          !(await review(
            "Reload this file?",
            "Unsaved edits will be discarded.",
            "Reload the current configuration from disk.",
            "Reload",
          ))
        )
          return;
        await loadConfig();
      }),
    );
    $("#config-text").addEventListener("input", () => {
      $("#config-state").textContent = "Unsaved draft";
      renderConfigPreview();
    });
    $("#config-controls-refresh").addEventListener(
      "click",
      guard(renderConfigControls),
    );
    $("#config-validate").addEventListener(
      "click",
      guard(async () => {
        await run("validate_configuration", {
          kind: configKind,
          content: $("#config-text").value,
        });
        $("#config-feedback").textContent =
          configKind === "fastfetch"
            ? "JSONC syntax and module structure are valid."
            : "Ghostty validation passed.";
      }),
    );
    $("#config-save").addEventListener("click", guard(saveConfig));
  }
  function populateIntegrations(values) {
    const normalized = normalizeIntegrations(values);
    for (const [key, value] of Object.entries(normalized))
      $("#integration-" + key).value = value;
  }
  function readIntegrations() {
    const v = {};
    for (const [key] of integrationFields)
      v[key] =
        key === "backupMaxHours"
          ? Number($("#integration-" + key).value)
          : $("#integration-" + key).value.trim();
    return v;
  }
  function filtered(repos) {
    return filterProjects(repos, workspace, group, favoritesOnly);
  }
  function decorateRepositories() {
    const groups = [
      ...new Set(
        Object.values(workspace)
          .map((p) => p.group)
          .filter(Boolean),
      ),
    ].sort();
    $("#repo-group").innerHTML =
      '<option value="">All groups</option>' +
      groups.map((g) => `<option value="${e(g)}">${e(g)}</option>`).join("");
    $("#repo-group").value = group;
    for (const card of $$("#repository-grid .repo-card")) {
      const path = card.querySelector("[data-path]")?.dataset.path;
      if (!path) continue;
      const project = workspace[path] || {};
      card
        .querySelector("h3")
        .insertAdjacentHTML(
          "afterbegin",
          `<button type="button" class="favorite-button" aria-label="${project.favorite ? "Unfavorite" : "Favorite"} ${e(card.querySelector("h3").textContent)}" aria-pressed="${Boolean(project.favorite)}">${project.favorite ? "★" : "☆"}</button>`,
        );
      if (project.group)
        card
          .querySelector(".repo-card-details")
          .insertAdjacentHTML(
            "afterbegin",
            `<span class="detail-chip">${e(project.group)}</span>`,
          );
      card.insertAdjacentHTML(
        "beforeend",
        `<div class="repo-extra-actions">${button("Details", "data-details")}${button("Launch profile", "data-launch")}</div>`,
      );
      card.querySelector(".favorite-button").addEventListener(
        "click",
        guard(async () => {
          await saveProject(path, { ...project, favorite: !project.favorite });
          renderRepositoryGrid();
        }),
      );
      card.querySelector("[data-details]").addEventListener(
        "click",
        guard(() => showRepository(path)),
      );
      card.querySelector("[data-launch]").addEventListener(
        "click",
        guard(async () => {
          const results = await run("launch_project", { path });
          toast(
            results.join(" · "),
            results.some((v) => !v.startsWith("Opened")),
          );
        }),
      );
    }
    renderAttention();
  }
  async function saveProject(path, project) {
    const defaults = {
      favorite: false,
      group: "",
      documentation: "",
      launchEditor: true,
      launchTerminal: true,
      launchDocs: false,
    };
    const data = { ...defaults, ...project };
    if (state.desktop) await run("save_project", { path, project: data });
    else
      localStorage.setItem(
        "command-center.workspace",
        JSON.stringify({ ...workspace, [path]: data }),
      );
    workspace[path] = data;
  }
  async function showRepository(path) {
    selectedRepo = path;
    selectedJob = jobs.find(job => job.cwd === path)?.id || selectedJob;
    const version = ++detailVersion;
    const repo = state.repositories.find((r) => r.path === path);
    $("#repo-detail-title").textContent = repo?.name || path;
    $("#repo-details").textContent = "Loading repository…";
    if (!$("#repo-detail-dialog").open) $("#repo-detail-dialog").showModal();
    const data = state.desktop
      ? await run("repository_details", { path })
      : {
          files: [{ status: " M", path: "README.md" }],
          commits: [
            { hash: "a1b2c3d", subject: "Sample commit", age: "2 hours ago" },
          ],
          diff: "Sample repository data",
        };
    if (version !== detailVersion) return;
    const project = {
      launchEditor: true,
      launchTerminal: true,
      ...workspace[path],
    };
    $("#repo-details").innerHTML =
      `<p class="path-label">${e(path)}</p><div class="button-row">${["fetch", "pull", "push"].map((name) => button(name[0].toUpperCase() + name.slice(1), `data-repo-job="${name}"`)).join("")}</div><p class="settings-help">Fetch updates remote status. Pull only fast-forwards a clean branch. Push publishes to the configured upstream.</p><div id="git-controls"></div><div class="module-columns"><section><h3>Change summary</h3><pre class="output compact-output">${e(data.diff || "No tracked-file diff")}</pre></section><section><h3>Recent commits</h3><ul class="commit-list">${data.commits.map((c) => `<li><code>${e(c.hash)}</code><span>${e(c.subject)}<small>${e(c.age)}</small></span></li>`).join("")}</ul></section></div><form id="project-form" class="stack-form"><h3>Organization & launch profile</h3><label>Group<input id="project-group" maxlength="60" value="${e(project.group || "")}" placeholder="Work, personal, system…"></label><label>Documentation URL<input id="project-docs" type="url" value="${e(project.documentation || "")}" placeholder="https://…"></label><div class="check-row">${[
        ["launchEditor", "Editor"],
        ["launchTerminal", "Terminal"],
        ["launchDocs", "Documentation"],
        ["favorite", "Favorite"],
      ]
        .map(
          ([key, label]) =>
            `<label><input type="checkbox" id="project-${key}" ${project[key] ? "checked" : ""}>${label}</label>`,
        )
        .join(
          "",
        )}</div><button class="primary-button" type="submit">Save profile</button></form>`;
    if (!commitDrafts.has(path)) commitDrafts.set(path, { message: "" });
    gitControls = mountGitControls({ target: $("#git-controls"), data, path, desktop: state.desktop,
      escapeHtml: e, action, refresh: () => showRepository(path), toast, draft: commitDrafts.get(path), invoke, jobs, openActivity: (id) => { selectedJob = id; $("#repo-detail-dialog").close(); switchView("activity"); } });
    $$("#repo-details [data-repo-job]").forEach((btn) =>
      btn.addEventListener(
        "click",
        guard(async () => {
          btn.disabled = true;
          try {
            const id = await action({ action: btn.dataset.repoJob, path }, () => {});
            if (id && $("#git-change-status")) $("#git-change-status").textContent = `${btn.textContent} running… View Activity for live output.`;
          } catch (error) {
            if ($("#git-change-status")) $("#git-change-status").textContent = `Could not start: ${error.message || error}`;
          } finally { btn.disabled = false; }
        }),
      ),
    );
    $("#project-form").addEventListener(
      "submit",
      guard(async (event) => {
        event.preventDefault();
        const data = {
          group: $("#project-group").value.trim(),
          documentation: $("#project-docs").value.trim(),
        };
        for (const k of [
          "launchEditor",
          "launchTerminal",
          "launchDocs",
          "favorite",
        ])
          data[k] = $("#project-" + k).checked;
        await saveProject(path, data);
        renderRepositoryGrid();
        toast("Project profile saved");
      }),
    );
  }
  async function poll() {
    if (polling || !state.desktop) return;
    polling = true;
    try {
      const history = await run("job_history", { selectedId: selectedJob });
      jobs = history.jobs;
      gitControls?.updateJobs(jobs);
      $$("#repo-details [data-repo-job]").forEach(button => { button.disabled = jobs.some(job => job.status === "running"); });
      if (history.closeRequested) {
        switchView("activity");
        toast(
          "A job is running. Wait for it to finish or stop it in Activity before closing.",
          true,
        );
      }
      $("#activity-error").textContent = history.persistenceError
        ? `History could not be saved: ${history.persistenceError}`
        : "";
      for (const job of jobs) {
        if (job.status === "running" || completed.has(job.id)) continue;
        completed.add(job.id);
        systemWorkflows.completed(job);
        const callback = callbacks.get(job.id);
        callbacks.delete(job.id);
        if (callback) {
          if (job.status === "succeeded") {
            try {
              await callback(await run("job_result", { id: job.id }));
            } catch (err) {
              toast(err.message, true);
            }
          } else
            toast(
              `${job.title}: ${job.status}. Open Activity for details.`,
              true,
            );
        }
        if (["stage", "stage-all", "unstage", "commit", "branch-create", "branch-switch", "stash-create", "stash-apply", "branch-publish", "fetch", "pull", "push"].includes(job.action)) {
          if (job.action === "commit" && job.status === "succeeded") {
            commitDrafts.delete(job.cwd);
            toast("Commit saved locally. Use Push to publish it.");
          }
          if ($("#repo-detail-dialog").open && selectedRepo === job.cwd) {
            try { await showRepository(selectedRepo); }
            catch (error) { toast(`Refresh Details failed: ${error}`, true); }
          }
        }
        if (job.finishedAt > Date.now() - 10000) {
          void loadRepositories();
          if (health) void refreshHealth();
          if (state.activeView === "sync") void refreshSync();
        }
      }
      if ($("#repo-detail-dialog").open) {
        const recent = jobs.find(job => job.cwd === selectedRepo);
        if (recent && $("#git-change-status")) {
          $("#git-change-status").textContent = `${recent.title}: ${recent.status}${recent.exitCode != null ? ` (exit ${recent.exitCode})` : ''}`;
          if ($("#git-inline-output")) { $("#git-inline-output").hidden = !recent.output; $("#git-inline-output").textContent = cleanOutput(recent.output || "").slice(-8000); }
        }
      }
      renderActivity();
      renderAttention();
    } catch (err) {
      $("#activity-error").textContent = String(err);
    } finally {
      polling = false;
    }
  }
  function renderActivity() {
    toolbox.updateJobs(jobs);
    $("#activity-count").textContent = String(
      jobs.filter((j) => j.status === "running").length,
    );
    $("#job-list").innerHTML = jobs.length
      ? jobs
          .map(
            (j) =>
              `<button type="button" class="job-row ${selectedJob === j.id ? "selected" : ""}" data-job-id="${e(j.id)}"><span class="job-status ${e(j.status)}">${e(j.status)}</span><strong>${e(j.title)}</strong><small>${e(age(j.startedAt))}</small></button>`,
          )
          .join("")
      : empty("No jobs yet. Operations you run will appear here.");
    $$("#job-list [data-job-id]").forEach((btn) =>
      btn.addEventListener("click", () => {
        selectedJob = btn.dataset.jobId;
        void poll();
      }),
    );
    const job = jobs.find((j) => j.id === selectedJob) || jobs[0];
    if (!job) return;
    selectedJob = job.id;
    const previous = $("#job-output");
    const stick =
      !previous ||
      previous.scrollTop + previous.clientHeight >= previous.scrollHeight - 50;
    const scroll = previous?.scrollTop || 0;
    $("#job-detail").innerHTML =
      `<div class="panel-heading"><h3>${e(job.title)}</h3><span class="status-badge ${job.status === "succeeded" ? "success" : "warning"}">${e(job.status)}</span></div><p class="settings-help">${e(age(job.startedAt))}${job.finishedAt ? " → " + e(age(job.finishedAt)) : ""} · Exit ${job.exitCode ?? "—"}</p><p class="path-label">${e(job.cwd)}</p><pre class="command-line">${e(job.command)}</pre>${job.externalTerminal ? '<p class="settings-help">This workflow uses your terminal. Private input and output are not recorded here.</p>' : ""}<pre id="job-output" class="output live-output" tabindex="0" aria-label="Job output">${e(cleanOutput(job.output) || (job.interactive ? "Open the terminal for live input and output." : "Waiting for output…"))}</pre>${job.truncated ? '<p class="error-text">Output reached the 2 MB limit. Remaining output was omitted.</p>' : ""}<div class="button-row">${job.status === "running" && !job.externalTerminal ? button("Stop job", 'id="cancel-job"') : ""}${job.status === "running" && job.externalTerminal ? button("Terminal closed? Stop monitoring", 'id="stop-terminal-monitor"') : ""}${!["running", "succeeded"].includes(job.status) && !job.acknowledged ? button("Mark reviewed", 'id="acknowledge-job"') : ""}</div>`;
    if (job.interactive && !job.externalTerminal) {
      $("#job-output").insertAdjacentHTML(
        "beforebegin",
        '<button type="button" class="primary-button" id="open-job-terminal">Open interactive terminal</button><p class="settings-help">Interactive output is held in memory only. Activity stores the command and result.</p>',
      );
      $("#open-job-terminal").addEventListener("click", () =>
        toolbox.openTerminal(job),
      );
    }
    $("#job-output").scrollTop = stick ? $("#job-output").scrollHeight : scroll;
    $("#cancel-job")?.addEventListener(
      "click",
      guard(async () => {
        if (
          await review(
            "Stop this job?",
            "A stopped operation can leave partial work. Inspect its output before retrying.",
            job.title,
            "Stop job",
          )
        ) {
          await run("cancel_job", { id: job.id });
          await poll();
        }
      }),
    );
    $("#stop-terminal-monitor")?.addEventListener(
      "click",
      guard(async () => {
        if (
          await review(
            "Stop monitoring this terminal?",
            "This does not stop a running workflow. Only continue if you have closed or stopped the workflow in its terminal.",
            job.title,
            "Stop monitoring",
          )
        ) {
          await run("stop_terminal_monitor", { id: job.id });
          await poll();
        }
      }),
    );
    $("#acknowledge-job")?.addEventListener(
      "click",
      guard(async () => {
        await run("acknowledge_job", { id: job.id });
        await poll();
      }),
    );
  }
  function renderAttention() {
    const items = attentionItems(
      state.repositories,
      jobs,
      health,
      state.settings.integrations.backupMaxHours,
    );
    $("#attention-count").textContent = items.length;
    const html = (list) =>
      list.length
        ? list
            .map(
              (item) =>
                `<button type="button" class="attention-row" data-attention="${e(item.id)}"><span class="attention-mark">!</span><span><strong>${e(item.title)}</strong><small>${e(item.detail)}</small></span><span>→</span></button>`,
            )
            .join("")
        : empty("No issues found in the loaded data.");
    $("#attention-items").innerHTML = html(items);
    $("#dashboard-attention").innerHTML = html(items.slice(0, 4));
    $$("[data-attention]").forEach((btn) =>
      btn.addEventListener(
        "click",
        guard(async () => {
          const item = items.find((i) => i.id === btn.dataset.attention);
          if (item.path) {
            switchView("repositories");
            await showRepository(item.path);
          } else {
            if (item.jobId) selectedJob = item.jobId;
            switchView(item.view);
          }
        }),
      ),
    );
  }
  let syncBusy = false;
  async function refreshSync() {
    if (syncBusy) return;
    if (!state.desktop) {
      $("#sync-status").innerHTML = empty(
        "Open the desktop app to inspect your configured Home Manager repository.",
      );
      return;
    }
    syncBusy = true;
    $("#sync-refresh").disabled = true;
    $("#sync-status").setAttribute("aria-busy", "true");
    $("#stat-sync-detail").textContent = "Checking dotfiles…";
    try {
      const data = await run("sync_status");
      $("#stat-sync").textContent = data.changes.trim()
        ? "Local changes"
        : "Working tree clean";
      $("#stat-sync-detail").textContent = "Dotfiles Git state";
      $("#sync-status").innerHTML =
        `<h3>${e(data.branch.trim() || "Detached HEAD")}</h3><p class="path-label">${e(data.path)}</p><p class="settings-help">Ahead / behind since last fetch: ${e(data.upstream?.trim() || "No tracking branch")}. Git status does not prove the running system matches your configuration.</p><h3>Pending source changes</h3><pre class="output">${e(data.changes || "No working changes")}\n${e(data.diff)}</pre><h3>Live configuration comparison</h3>${(data.configDrift || []).map((item) => `<p class="readiness-row"><strong>${e(item.name)}</strong><span>${e(item.status)}${item.managed ? " · Home Manager source" : ""}</span></p>`).join("")}<h3>Home Manager generations</h3><pre class="output compact-output">${e(data.generations || "No generation information available")}</pre>`;
    } catch (err) {
      $("#sync-status").innerHTML = empty(
        e(String(err)) + " · Configure integrations in Settings.",
      );
      $("#stat-sync").textContent = "Not connected";
      $("#stat-sync-detail").textContent = "Check integration settings";
    } finally {
      syncBusy = false;
      $("#sync-refresh").disabled = false;
      $("#sync-status").setAttribute("aria-busy", "false");
    }
  }
  async function refreshHealth() {
    if (healthBusy) return;
    healthBusy = true;
    for (const button of $$("#backup-view [data-job='backup'], #backup-view [data-job='backup-full']")) button.disabled = true;
    $("#backup-summary").setAttribute("aria-busy", "true");
    $("#health-time").textContent = "Checking system health…";
    $("#health-panels").setAttribute("aria-busy", "true");
    $$("[data-health-refresh]").forEach((b) => (b.disabled = true));
    try {
      if (!state.desktop) {
        $("#health-time").textContent = "Browser preview · Checks unavailable";
        $("#health-panels").innerHTML = empty(
          "System checks run in the desktop app.",
        );
        return;
      }
      health = await run("system_health");
      renderHealth();
      renderAttention();
    } catch (err) {
      $("#backup-summary").textContent = `Backup status unavailable: ${err}. Refresh health before starting a backup.`;
      $("#health-time").textContent = `Health checks failed: ${err}. Previous results may be stale. Retry with Refresh.`;
      toast(`Health checks failed: ${err}`, true);
    } finally {
      healthBusy = false;
      $("#backup-summary").setAttribute("aria-busy", "false");
      $("#health-panels").setAttribute("aria-busy", "false");
      $$("[data-health-refresh]").forEach((b) => (b.disabled = false));
    }
  }
  function renderHealth() {
    $("#health-time").textContent =
      `Checked ${age(health.checkedAt)} · Package updates use the locally cached package database.`;
    const sections = [
      ["Disk usage", health.disk],
      ["Failed user services", health.userServices],
      ["Failed system services", health.systemServices],
      ["Cached package updates", health.updates],
    ];
    $("#health-panels").innerHTML =
      sections
        .map(
          ([title, data]) =>
            `<section class="panel module-panel"><h3>${title}</h3><pre class="output">${e(data.available ? data.output.trim() || "None reported" : data.error || "Unavailable")}</pre></section>`,
        )
        .join("") +
      `<section class="panel module-panel"><h3>Battery</h3>${health.batteries.length ? health.batteries.map((b) => `<p>${e(b.name)} · ${e(b.capacity)}% · ${e(b.status)}</p>`).join("") : empty("No battery detected")}</section><section class="panel module-panel"><h3>Installed tools</h3>${health.tools.map((t) => `<p class="readiness-row"><span>${e(t.name)}</span><span>${t.available ? "Available" : "Not found"}</span></p>`).join("")}</section>`;
    const b = backupState(health, state.settings.integrations.backupMaxHours);
    $("#stat-backup").textContent = b.label;
    $("#stat-backup-detail").textContent = b.detail;
    renderBackupOverview({ target: $("#backup-summary"), health, integrations: state.settings.integrations, escapeHtml:e, desktop:state.desktop });
    $("#recovery-checks").innerHTML = health.readiness
      .map(
        (r) =>
          `<div class="readiness-row"><span class="status-badge ${r.ready ? "success" : "warning"}">${r.ready ? "Found" : "Check needed"}</span><div><strong>${e(r.label)}</strong><small>${e(r.detail || "Not configured")}</small></div></div>`,
      )
      .join("");
    const failed = [health.userServices, health.systemServices].filter(
      (d) => d.available && d.output.trim(),
    ).length;
    const unknown = [
      health.disk,
      health.userServices,
      health.systemServices,
    ].some((d) => !d.available);
    $("#stat-health").textContent = failed
      ? "Service failures"
      : unknown
        ? "Some checks unavailable"
        : "Checks loaded";
    $("#stat-health-detail").textContent =
      `Updated ${new Date(health.checkedAt).toLocaleTimeString()}`;
  }
  function renderSnapshots() {
    $("#snapshots").innerHTML = snapshots.length
      ? snapshots
          .map(
            (s) =>
              `<button type="button" class="snapshot-row ${snapshotId === s.id ? "selected" : ""}" data-snapshot="${e(s.id)}"><strong>${e(age(s.time))}</strong><small>${e(s.short_id || s.id.slice(0, 8))} · ${e(s.hostname || "Unknown host")}</small><small>${e((s.paths || []).join(", "))}</small></button>`,
          )
          .join("")
      : empty("No snapshots returned.");
    $$("[data-snapshot]").forEach((btn) =>
      btn.addEventListener("click", () => {
        snapshotId = btn.dataset.snapshot;
        $("#restore-snapshot").value = snapshotId;
        $("#restore-include").value = "";
        snapshotDirectory = "/";
        $("#snapshot-directory").value = "/";
        $("#snapshot-files").innerHTML = empty(
          "Press Browse to read this snapshot directory.",
        );
        renderSnapshots();
      }),
    );
  }
  async function browseSnapshot(directory) {
    if (!snapshotId) throw new Error("Select a snapshot first");
    const requestedSnapshot = snapshotId;
    await action(
      { action: "snapshot-files", snapshot: snapshotId, directory },
      (job) => {
        if (snapshotId !== requestedSnapshot) return;
        fileRows = parseSnapshotFiles(job);
        snapshotDirectory = directory;
        renderFiles();
      },
    );
  }
  function renderFiles() {
    $("#snapshot-files").innerHTML =
      `<p class="settings-help">${e(snapshotDirectory)} · ${fileRows.length} entries</p><div class="file-browser">${fileRows.map((f, index) => `<div class="browser-row"><span>${f.type === "dir" ? "▣" : "·"}</span><span title="${e(f.path)}">${e(f.name || f.path)}</span>${f.type === "dir" ? button("Open", `data-file-open="${index}"`) : ""}${button("Select", `data-file-select="${index}"`)}</div>`).join("") || empty("No entries in this directory.")}</div>`;
    $$("[data-file-open]").forEach((btn) =>
      btn.addEventListener(
        "click",
        guard(() => {
          $("#snapshot-directory").value =
            fileRows[Number(btn.dataset.fileOpen)].path;
          return browseSnapshot($("#snapshot-directory").value);
        }),
      ),
    );
    $$("[data-file-select]").forEach((btn) =>
      btn.addEventListener("click", () => {
        $("#restore-include").value =
          fileRows[Number(btn.dataset.fileSelect)].path;
        toast("Path selected for restore. Review the destination below.");
      }),
    );
  }
  async function loadConfig() {
    const version = ++configVersion;
    configHistory.invalidate();
    $("#config-state").textContent = "Loading…";
    configDocument = null;
    $("#config-text").value = "";
    $("#config-controls").innerHTML = "";
    try {
      const doc = state.desktop
        ? await run("load_configuration", { kind: configKind })
        : {
            kind: configKind,
            path: "Browser preview",
            livePath: "Sample",
            managed: false,
            revision: "demo",
            content:
              configKind === "ghostty"
                ? "font-family = JetBrainsMono Nerd Font\nfont-size = 13\nwindow-padding-x = 12\nwindow-padding-y = 12\nbackground-opacity = 0.95\n"
                : '{\n  "logo": {"type": "auto", "source": "arch"},\n  "modules": ["os", "kernel", "shell", "cpu", "memory", "disk"]\n}\n',
          };
      if (version !== configVersion) return;
      configDocument = doc;
      $("#config-text").value = doc.content;
      $("#config-source").textContent =
        `Source: ${doc.path}${doc.managed ? " · Home Manager owns the live file. Apply System Sync after saving." : ""}`;
      $("#config-state").textContent = "Loaded";
      $("#config-feedback").textContent = doc.managed
        ? "Edits go to the source. Build and apply Home Manager to activate them."
        : "A timestamped backup is kept when you save.";
      renderConfigControls();
      void configHistory.refresh();
    } catch (err) {
      if (version === configVersion) {
        $("#config-state").textContent = "Unavailable";
        $("#config-source").textContent = String(err);
      }
    }
  }
  function renderConfigControls() {
    if (!configDocument) return;
    if (configKind === "ghostty") {
      const values = ghosttyValues($("#config-text").value);
      $("#config-controls").innerHTML =
        `<form id="ghostty-controls" class="stack-form">${ghosttyFields.map(([key, label, type]) => `<label>${label}${type === "select" ? `<select data-ghostty="${key}"><option value="">Default</option>${(key === "cursor-style" ? ["block", "bar", "underline", "block_hollow"] : ["true", "false"]).map((v) => `<option value="${v}" ${values[key] === v ? "selected" : ""}>${v}</option>`).join("")}</select>` : `<input data-ghostty="${key}" type="${type}" ${type === "number" ? 'step="any"' : ""} value="${e(values[key] || "")}">`}</label>`).join("")}<button type="submit" class="secondary-button">Apply controls to draft</button></form>`;
      $("#ghostty-controls").addEventListener(
        "submit",
        guard((event) => {
          event.preventDefault();
          const values = Object.fromEntries(
            $$("[data-ghostty]").map((input) => [
              input.dataset.ghostty,
              input.value,
            ]),
          );
          $("#config-text").value = updateGhostty(
            $("#config-text").value,
            values,
          );
          $("#config-state").textContent = "Unsaved draft";
          renderConfigPreview();
        }),
      );
    } else {
      const data = parseFastfetch($("#config-text").value);
      const modules = data.modules || [];
      if (!Array.isArray(modules)) throw new Error("Modules must be an array");
      $("#config-controls").innerHTML =
        `<form id="fastfetch-controls" class="stack-form"><label>Logo source<input id="fastfetch-logo" value="${e(data.logo?.source || "")}"></label><label>Logo type<input id="fastfetch-logo-type" value="${e(data.logo?.type || "auto")}"></label><label>Separator<input id="fastfetch-separator" value="${e(data.display?.separator ?? ": ")}"></label><button type="submit" class="secondary-button">Apply logo & separator</button></form><h3>Modules</h3><p class="settings-help">Reorder or remove entries. Custom module options are preserved. Use Source configuration for advanced edits.</p><div class="module-order">${modules.map((m, index) => `<div class="browser-row"><span>${e(moduleType(m) || "Unknown")}</span>${button("↑", `data-module-up="${index}" aria-label="Move module ${index + 1} up"`)}${button("↓", `data-module-down="${index}" aria-label="Move module ${index + 1} down"`)}${button("Remove", `data-module-remove="${index}" aria-label="Remove module ${index + 1}"`)}</div>`).join("")}</div><div class="button-row"><select id="new-module" aria-label="Module to add">${["os", "kernel", "packages", "shell", "terminal", "cpu", "gpu", "memory", "disk", "battery", "uptime", "break"].map((v) => `<option>${v}</option>`).join("")}</select>${button("Add module", 'id="add-module"')}</div>`;
      $("#fastfetch-controls").addEventListener(
        "submit",
        guard((event) => {
          event.preventDefault();
          let text = $("#config-text").value;
          for (const [path, value] of [
            [["logo", "source"], $("#fastfetch-logo").value],
            [["logo", "type"], $("#fastfetch-logo-type").value],
            [["display", "separator"], $("#fastfetch-separator").value],
          ])
            text = editFastfetch(text, path, value);
          $("#config-text").value = text;
          $("#config-state").textContent = "Unsaved draft";
          renderConfigPreview();
        }),
      );
      for (const [attr, delta] of [
        ["up", -1],
        ["down", 1],
        ["remove", 0],
      ])
        $$(`[data-module-${attr}]`).forEach((btn) =>
          btn.addEventListener(
            "click",
            guard(() => {
              const current =
                parseFastfetch($("#config-text").value).modules || [];
              const index = Number(btn.getAttribute(`data-module-${attr}`));
              if (delta === 0) current.splice(index, 1);
              else if (index + delta >= 0 && index + delta < current.length)
                [current[index], current[index + delta]] = [
                  current[index + delta],
                  current[index],
                ];
              setModules(current);
            }),
          ),
        );
      $("#add-module").addEventListener(
        "click",
        guard(() =>
          setModules([
            ...(parseFastfetch($("#config-text").value).modules || []),
            $("#new-module").value,
          ]),
        ),
      );
    }
    renderConfigPreview();
  }
  function setModules(modules) {
    $("#config-text").value = editFastfetch(
      $("#config-text").value,
      ["modules"],
      modules,
    );
    $("#config-state").textContent = "Unsaved draft";
    renderConfigControls();
  }
  function renderConfigPreview() {
    try {
      if (configKind === "ghostty") {
        const values = ghosttyValues($("#config-text").value);
        const pane = $("#config-preview");
        pane.style.fontFamily = values["font-family"] || "monospace";
        pane.style.fontSize = `${Math.max(9, Math.min(24, Number(values["font-size"]) || 12))}px`;
        pane.style.padding = `${Math.max(8, Math.min(40, Number(values["window-padding-y"]) || 16))}px ${Math.max(8, Math.min(40, Number(values["window-padding-x"]) || 16))}px`;
        $("#config-preview").textContent =
          `${values["font-family"] || "Default font"} · ${values["font-size"] || "Default"} pt\nTheme: ${values.theme || "Default"}\nPadding: ${values["window-padding-x"] || "Default"} × ${values["window-padding-y"] || "Default"}\nOpacity: ${values["background-opacity"] || "1"}\n\ncommander@workstation ~/projects\n❯ git status\nOn branch main\nWorking tree clean ▊`;
      } else {
        $("#config-preview").removeAttribute("style");
        const data = parseFastfetch($("#config-text").value);
        $("#config-preview").textContent =
          `Logo: ${data.logo?.source || "Automatic"}\n\n` +
          (data.modules || [])
            .map((m) => {
              const type = moduleType(m);
              return type === "break"
                ? ""
                : type === "command"
                  ? "[Command module — not executed]"
                  : `${typeof m === "object" ? m.key || type : type}${data.display?.separator ?? ": "}[${type === "custom" ? "custom formatting" : "preview value"}]`;
            })
            .join("\n");
      }
    } catch (error) {
      $("#config-preview").textContent = error.message;
    }
  }
  async function saveConfig() {
    if (!configDocument) throw new Error("Load a configuration file first");
    const content = $("#config-text").value;
    if (content === configDocument.content) {
      toast("No changes to save");
      return;
    }
    await run("validate_configuration", { kind: configKind, content });
    if (
      !(await review(
        `Save ${configKind} configuration?`,
        `${configDocument.path}\nThe previous file will be backed up.${configDocument.managed ? " Apply Home Manager afterward to activate this source." : ""}`,
        `CURRENT\n${configDocument.content}\n\nPROPOSED\n${content}`,
        "Save configuration",
      ))
    )
      return;
    const result = await run("save_configuration", {
      kind: configKind,
      content,
      revision: configDocument.revision,
      expectedPath: configDocument.path,
    });
    await loadConfig();
    $("#config-feedback").textContent = result;
    toast("Configuration saved");
  }
  async function initialize() {
    try {
      workspace = state.desktop
        ? await run("load_workspace")
        : JSON.parse(localStorage.getItem("command-center.workspace") || "{}");
    } catch (error) {
      toast(`Project profiles could not be loaded: ${error}`, true);
      workspace = {};
    }
    if (
      state.desktop &&
      !state.settingsLoadFailed &&
      !state.settings.integrations.dotfilesPath
    ) {
      try {
        const detected = await run("detect_integrations");
        state.settings.integrations = normalizeIntegrations({
          ...state.settings.integrations,
          ...Object.fromEntries(
            Object.entries(detected).filter(([, v]) => v !== ""),
          ),
        });
        await run("save_settings", { settings: state.settings });
        populateIntegrations(state.settings.integrations);
      } catch (error) {
        toast(`Setup detection: ${error}`, true);
      }
    }
    renderRepositoryGrid();
    renderActivity();
    renderAttention();
    void refreshHealth();
    void refreshSync();
    await poll();
    setInterval(() => void poll(), 1500);
  }
  function onView(view) {
    toolbox.onView(view);
    systemWorkflows.onView(view);
    if (view === "sync") void refreshSync();
    if (view === "backup") void refreshHealth();
    if (view === "config" && !configDocument) void loadConfig();
    if (view === "activity") renderActivity();
    if (view === "attention") renderAttention();
  }
  mount();
  const toolbox = createToolbox({ ...api, run, guard, review, action });
  const systemWorkflows = createSystemWorkflows({...api,run,action});
  const configHistory = createConfigHistory({$,run,review,getDocument:()=>configDocument,getKind:()=>configKind,setDraft(content){$("#config-text").value=content;$("#config-state").textContent="Unsaved restored draft";renderConfigControls();}});
  return {
    initialize,
    openRepositoryDetails(path) { switchView("repositories"); return showRepository(path); },
    action,
    onView,
    filtered,
    decorateRepositories,
    populateIntegrations,
    readIntegrations,
    refreshHealth,
    refreshSync,
  };
}
