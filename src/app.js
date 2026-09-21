import { version } from "../package.json";
import { setupSettingsTools } from "./settings-tools.js";
import { createFeatures } from "./features.js";
import { needsAttention, statusParts, selectRepositories } from "./repository-view.js";
import { defaults, normalize, readBrowserSettings } from "./preferences.js";
const invoke = window.__TAURI__?.core?.invoke;

const demoRepositories = [
  { name: "config-bible", path: "~/github/projects/config-bible", branch: "main", dirty: false, modified_files: 0, ahead: 0, behind: 0, remote_url: "https://github.com/commander/config-bible", last_commit: "Documented Home Manager workflow" },
  { name: "dotfiles", path: "~/dotfiles", branch: "main", dirty: true, modified_files: 3, ahead: 1, behind: 0, remote_url: "https://github.com/commander/dotfiles", last_commit: "Refine fish functions" },
  { name: "command-center", path: "~/github/projects/command-center", branch: "main", dirty: false, modified_files: 0, ahead: 0, behind: 0, remote_url: null, last_commit: "Start Command Center" },
  { name: "homelab", path: "~/github/projects/homelab", branch: "main", dirty: false, modified_files: 0, ahead: 0, behind: 2, remote_url: "https://github.com/commander/homelab", last_commit: "Update service inventory" }
];

const state = {
  repositories: [],
  settings: normalize(),
  roots: [],
  scanning: false,
  scanAgain: false,
  saving: false,
  preferencesDirty: false,
  activeView: "dashboard",
  desktop: Boolean(invoke)
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

function toast(message, persistent = false) {
  const element = $("#toast");
  $("#toast-message").textContent = message;
  element.classList.add("show");
  clearTimeout(toast.timer);
  if (!persistent) toast.timer = setTimeout(() => element.classList.remove("show"), 5000);
}

function repoState(repo) {
  return statusParts(repo).map(p => p.text).join(" · ");
}
function badgeMarkup(repo) {
  return statusParts(repo).map(p => `<span class="status-badge ${p.tone}">${escapeHtml(p.text)}</span>`).join("");
}

function renderDashboardRepos() {
  const target = $("#dashboard-repos");
  const repos = selectRepositories(state.repositories, "", "all", state.settings.repoSort).slice(0, 4);
  if (!repos.length) {
    target.innerHTML = `<div class="empty-state"><div>No repositories found.<br><button class="secondary-button" data-open-settings>Add a scan folder</button></div></div>`;
    target.querySelector("[data-open-settings]")?.addEventListener("click", openSettings);
    return;
  }
  target.innerHTML = repos.map((repo) => `<div class="repo-row"><div class="repo-glyph">${escapeHtml(repo.name.slice(0, 2).toUpperCase())}</div><div class="repo-meta"><strong>${escapeHtml(repo.name)}</strong><small>${escapeHtml(repo.path)}</small></div><span class="branch">${escapeHtml(repo.branch || "detached")}</span><span class="repo-state ${needsAttention(repo) ? "dirty" : ""}">${repoState(repo)}</span></div>`).join("");
}

function renderRepositoryGrid() {
  const search = $("#repo-search").value.trim().toLowerCase();
  const filter = $("#repo-filter").value;
  const repos = selectRepositories(features.filtered(state.repositories), search, filter, $("#repo-sort").value || state.settings.repoSort);
  const target = $("#repository-grid");
  $("#repo-results").textContent = `${repos.length} of ${state.repositories.length} repositories`;
  if (!repos.length) {
    const hasFilters = search || filter !== "all" || $("#repo-group").value || $("#favorites-filter").getAttribute("aria-pressed") === "true";
    target.innerHTML = `<div class="empty-state panel"><div><h3>${hasFilters ? "No matching repositories" : "Your workspace starts here"}</h3><p>${hasFilters ? "Try a different search or clear your filters." : "Add a folder containing Git projects in Settings."}</p><button class="secondary-button" id="empty-action">${hasFilters ? "Clear filters" : "Add scan folders"}</button></div></div>`;
    $("#empty-action").addEventListener("click", () => {
      if (hasFilters) { $("#repo-search").value = ""; $("#repo-filter").value = "all"; $("#repo-group").value = ""; $("#repo-group").dispatchEvent(new Event("change")); if ($("#favorites-filter").getAttribute("aria-pressed") === "true") $("#favorites-filter").click(); renderRepositoryGrid(); }
      else openSettings();
    });
    features.decorateRepositories();
    return;
  }
  target.innerHTML = repos.map((repo) => `<article class="repo-card"><div class="repo-card-head"><div class="repo-glyph" aria-hidden="true">${escapeHtml(repo.name.slice(0, 2).toUpperCase())}</div><div class="repo-badges">${badgeMarkup(repo)}</div></div><h3 title="${escapeHtml(repo.name)}">${escapeHtml(repo.name)}</h3><div class="path" title="${escapeHtml(repo.path)}">${escapeHtml(repo.path)}</div><div class="repo-card-details"><span class="detail-chip branch-chip" title="Branch">⌘ ${escapeHtml(repo.branch || "detached")}</span><span class="detail-chip commit-chip" title="${escapeHtml(repo.last_commit || "No commits yet")}">${escapeHtml(repo.last_commit || "No commits yet")}</span></div><div class="repo-card-actions"><button data-open="editor" data-path="${escapeHtml(repo.path)}" aria-label="Open ${escapeHtml(repo.name)} in editor">Open editor</button><button data-open="terminal" data-path="${escapeHtml(repo.path)}" aria-label="Open terminal for ${escapeHtml(repo.name)}">Terminal</button>${repo.remote_url ? `<button data-open="remote" data-path="${escapeHtml(repo.path)}" aria-label="Open remote for ${escapeHtml(repo.name)}">Remote ↗</button>` : ""}</div></article>`).join("");
  target.querySelectorAll("[data-open]").forEach((button) => button.addEventListener("click", async () => {
    button.disabled = true;
    try { await openRepository(button.dataset.path, button.dataset.open); }
    finally { button.disabled = false; }
  }));
  features.decorateRepositories();
}

function updateStats() {
  const clean = state.repositories.filter((repo) => !needsAttention(repo)).length;
  $("#repo-total").textContent = state.repositories.length;
  $("#repo-count-nav").textContent = state.repositories.length;
  $("#repo-clean").textContent = `${clean} clean · ${state.repositories.length - clean} need attention`;
}

async function loadRepositories(showNotice = false) {
  if (state.scanning) { state.scanAgain = true; return; }
  state.scanning = true;
  $("#refresh-button").disabled = true;
  $("#repo-freshness").textContent = "Scanning repositories…";
  $("#repository-grid").setAttribute("aria-busy", "true");
  try {
    state.repositories = state.desktop ? await invoke("discover_repositories", { roots: state.roots, scanDepth: state.settings.scanDepth }) : demoRepositories;
    renderDashboardRepos();
    renderRepositoryGrid();
    updateStats();
    $("#scan-status").textContent = state.desktop ? `Last scan: ${new Date().toLocaleTimeString()} · ${state.repositories.length} repositories` : "Preview uses sample repositories.";
    $("#repo-freshness").textContent = state.desktop ? `Updated ${new Date().toLocaleTimeString()} · Local Git state` : "Sample data · Browser preview";
    if (showNotice) toast(state.desktop ? `Scanned ${state.repositories.length} repositories` : "Preview refreshed — desktop scanning activates in Tauri");
  } catch (error) {
    $("#scan-status").textContent = `Scan failed: ${error}`;
    $("#repo-freshness").textContent = "Scan failed · Displayed results may be stale";
    toast(`Scan failed: ${error}`, true);
  } finally {
    $("#repository-grid").setAttribute("aria-busy", "false");
    state.scanning = false;
    $("#refresh-button").disabled = false;
    if (state.scanAgain) { state.scanAgain = false; void loadRepositories(); }
  }
}

async function openRepository(path, target) {
  if (!state.desktop) return toast(`Preview: would open ${path} in ${target}`);
  try { await invoke("open_repository", { path, target, editor: state.settings.editor, terminal: state.settings.terminal }); }
  catch (error) { toast(`Could not open repository: ${error}`, true); }
}

const viewCopy = {
  toolbox: ["Workstation tools", "Toolbox"],
  terminal: ["Interactive workspace", "Terminal"],
  dashboard: ["Overview", "Good evening, Commander."],
  repositories: ["Workspace", "Repositories"],
  sync: ["System", "System Sync"],
  backup: ["Recovery", "Backup & Restore"],
  config: ["Personalize", "Configuration"],
  health: ["Diagnostics", "System Health"],
  activity: ["Operations", "Activity"],
  attention: ["Overview", "Needs attention"],
  settings: ["Preferences", "Settings"]
};

const placeholderCopy = {
  sync: "Pull your declarative configuration, inspect drift, and apply Home Manager safely.",
  backup: "Run Restic backups, browse snapshots, verify repositories, and guide restores.",
  config: "Friendly editors for Ghostty, Fastfetch, Fish, Starship, Git, and Neovim.",
  health: "Disk, battery, package, service, backup, Git, and NVMe health in one view."
};

function switchView(view) {
  state.activeView = view;
  features.onView(view);
  if (view !== "settings") applyAppearance(state.settings);
  else if (state.preferencesDirty) { try { applyAppearance(draftPreferences()); } catch {} }
  $$(".nav-item[data-view]").forEach((item) => item.classList.toggle("active", item.dataset.view === view));
  $$(".view").forEach((element) => element.classList.remove("active-view"));
  const directView = $(`#${view}-view`);
  (directView || $("#placeholder-view")).classList.add("active-view");
  $("#view-eyebrow").textContent = viewCopy[view]?.[0] || "Command Center";
  $("#view-title").textContent = view === "dashboard" ? `Welcome back, ${state.settings.displayName}.` : viewCopy[view]?.[1] || "Command Center";
  if (!directView) {
    $("#placeholder-title").textContent = viewCopy[view]?.[1] || "Module coming next";
    $("#placeholder-copy").textContent = placeholderCopy[view] || "This module is planned for a future phase.";
  }
}

function openSettings() { switchView("settings"); }

let refreshTimer;
const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
function applyAppearance(prefs) {
  const root = document.documentElement;
  root.dataset.theme = prefs.theme === "system" ? (systemTheme.matches ? "dark" : "light") : prefs.theme;
  root.dataset.textSize = prefs.textSize;
  root.dataset.layout = prefs.repoLayout;
  root.dataset.paths = prefs.showPaths ? "show" : "hide";
  root.dataset.hero = prefs.showHero ? "show" : "hide";
  root.dataset.accent = prefs.accent;
  root.dataset.density = prefs.density;
  root.dataset.motion = prefs.reducedMotion ? "reduced" : "normal";
}
systemTheme.addEventListener("change", () => {
  try { applyAppearance(state.activeView === "settings" && state.preferencesDirty ? draftPreferences() : state.settings); }
  catch { applyAppearance(state.settings); }
});
function updateDraftStatus() {
  try {
    const draft = draftPreferences();
    state.preferencesDirty = JSON.stringify(draft) !== JSON.stringify(state.settings);
    applyAppearance(draft);
  } catch { state.preferencesDirty = true; }
  $("#settings-status").textContent = state.preferencesDirty ? "Unsaved changes · Save to keep them" : "No unsaved changes";
  $("#save-preferences").disabled = !state.preferencesDirty;
  $("#discard-preferences").disabled = !state.preferencesDirty;
}
function applyPreferences() {
  const prefs = state.settings;
  applyAppearance(prefs);
  $("#repo-sort").value = prefs.repoSort;
  document.documentElement.dataset.accent = prefs.accent;
  document.documentElement.dataset.density = prefs.density;
  document.documentElement.dataset.motion = prefs.reducedMotion ? "reduced" : "normal";
  $(".profile strong").textContent = prefs.displayName;
  $(".avatar").textContent = [...prefs.displayName].slice(0,2).join("").toUpperCase();
  $(".brand small").textContent = `${prefs.displayName} Workspace`;
  clearInterval(refreshTimer);
  if (prefs.refreshSeconds) refreshTimer = setInterval(() => {
    if (!document.hidden) void loadRepositories();
  }, prefs.refreshSeconds * 1000);
  switchView(state.activeView);
}

function populatePreferences(prefs) {
  for (const [id,key] of [["name","displayName"],["editor","editor"],["terminal","terminal"],["accent","accent"],["density","density"],["startup","startupPage"],["depth","scanDepth"],["refresh","refreshSeconds"],["theme","theme"],["text-size","textSize"],["layout","repoLayout"],["sort","repoSort"]]) {
    $(`#pref-${id}`).value = prefs[key];
  }
  $("#pref-motion").checked = prefs.reducedMotion;
  $("#pref-paths").checked = prefs.showPaths;
  $("#pref-hero").checked = prefs.showHero;
  $("#pref-roots").value = prefs.roots.join("\n");
  features.populateIntegrations(prefs.integrations);
}

function draftPreferences() {
  const roots = $("#pref-roots").value.split(/\r?\n/).map(r => r.trim()).filter(Boolean);
  if (roots.length > 32 || roots.some(r => r.length > 4096 || r.includes("\0") || !/^(~$|~\/|\/)/.test(r))) throw new Error("Use up to 32 absolute or ~/ folder paths, one per line.");
  if (!$("#pref-name").value.trim()) throw new Error("Enter a display name.");
  return normalize({ integrations: features.readIntegrations(), displayName: $("#pref-name").value, editor: $("#pref-editor").value,
    terminal: $("#pref-terminal").value, accent: $("#pref-accent").value, density: $("#pref-density").value,
    theme: $("#pref-theme").value, textSize: $("#pref-text-size").value,
    repoLayout: $("#pref-layout").value, repoSort: $("#pref-sort").value,
    showPaths: $("#pref-paths").checked, showHero: $("#pref-hero").checked,
    reducedMotion: $("#pref-motion").checked, startupPage: $("#pref-startup").value,
    scanDepth: Number($("#pref-depth").value), refreshSeconds: Number($("#pref-refresh").value), roots });
}

async function savePreferences(event) {
  event.preventDefault();
  if (state.saving) return;
  state.saving = true;
  const form = $("#preferences-form");
  try {
    const next = draftPreferences();
    [...form.elements].forEach(el => el.disabled = true);
    if (state.desktop) await invoke("save_settings", { settings: next });
    else localStorage.setItem("command-center.settings", JSON.stringify(next));
    state.preferencesDirty = false;
    state.settings = next;
    state.roots = next.roots;
    applyPreferences();
    populatePreferences(next);
    $("#settings-status").textContent = state.desktop ? "Saved on this device." : "Saved in this browser preview.";
    toast("Settings saved");
    void features.refreshHealth();
    void features.refreshSync();
    void loadRepositories();
  } catch (error) {
    $("#settings-status").textContent = `Not saved: ${error.message || error}`;
  } finally {
    state.saving = false;
    [...form.elements].forEach(el => el.disabled = false);
    $("#save-preferences").disabled = !state.preferencesDirty;
    $("#discard-preferences").disabled = !state.preferencesDirty;
  }
}

async function initialize() {
  let prefs;
  let status = "Preferences are up to date.";
  try {
    if (state.desktop) {
      prefs = await invoke("load_settings");
      if (!prefs) {
        prefs = readBrowserSettings(localStorage);
        await invoke("save_settings", { settings: prefs });
      }
    } else prefs = readBrowserSettings(localStorage);
  } catch (error) { state.settingsLoadFailed = true; status = `Could not load preferences: ${error}. Defaults shown; save to replace the settings file (a backup will be kept).`; }
  state.settings = normalize(prefs);
  state.roots = state.settings.roots;
  state.activeView = state.settings.startupPage;
  populatePreferences(state.settings);
  applyPreferences();
  $("#settings-status").textContent = status;
  $("#preview-notice").hidden = state.desktop;
  $("#preferences-form").inert = false;
  $("#save-preferences").disabled = true;
  $("#discard-preferences").disabled = true;
  await features.initialize();
  void loadRepositories();
}

function bindEvents() {
  $$("[data-view]").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));
  $$("[data-go]").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.go)));

  $("#add-root-button").addEventListener("click", openSettings);
  $("#refresh-button").addEventListener("click", () => loadRepositories(true));
  $("#repo-search").addEventListener("input", renderRepositoryGrid);
  $("#repo-sort").addEventListener("change", renderRepositoryGrid);
  $("#dismiss-toast").addEventListener("click", () => $("#toast").classList.remove("show"));
  document.addEventListener("keydown", event => {
    if (event.target.closest?.("#embedded-terminal")) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault(); switchView("repositories"); $("#repo-search").focus();
    }
  });
  $("#repo-search").addEventListener("keydown", event => { if (event.key === "Escape") { event.target.value = ""; renderRepositoryGrid(); } });
  $("#repo-filter").addEventListener("change", renderRepositoryGrid);
  $("#quick-action-button").addEventListener("click", () => switchView("dashboard"));
  $$("[data-action]").forEach((button) => button.addEventListener("click", () => {
    const action = button.dataset.action;
    if (action === "sync") loadRepositories(true); else if (action === "config") switchView("config"); else if (action === "backup") switchView("backup"); else if (action === "home-manager") switchView("sync");
  }));
  $("#preferences-form").addEventListener("submit", savePreferences);
  $("#preferences-form").addEventListener("input", updateDraftStatus);
  $("#preferences-form").addEventListener("change", updateDraftStatus);
  $("#discard-preferences").addEventListener("click", () => {
    populatePreferences(state.settings);
    state.preferencesDirty = false;
    updateDraftStatus();
    $("#settings-status").textContent = "Changes discarded.";
  });
  $("#reset-preferences").addEventListener("click", () => {
    populatePreferences(normalize(defaults));
    updateDraftStatus();
    $("#settings-status").textContent = "Defaults selected. Save to apply, or discard to keep your preferences.";
  });
}

const features = createFeatures({state, $, $$, escapeHtml, toast, switchView, loadRepositories, renderRepositoryGrid});
$("#preferences-form").inert = true;
setupSettingsTools({ invoke, readIntegrations: features.readIntegrations });
$(".version-badge").textContent = `Version ${version}`;
bindEvents();
void initialize();
