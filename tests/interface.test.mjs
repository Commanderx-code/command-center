import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import { normalize } from "../src/preferences.js";
const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const bundle = await build({
  entryPoints: [new URL("../src/app.js", import.meta.url).pathname],
  bundle: true,
  format: "iife",
  write: false,
});
const code = bundle.outputFiles[0].text;
async function setup(overrides = {}) {
  const calls = [];
  const prefs = normalize({
    integrations: { dotfilesPath: "/fixture/dotfiles" },
  });
  const repo = {
    name: "fixture",
    path: "/fixture/repo",
    branch: "main",
    dirty: false,
    modified_files: 0,
    ahead: 1,
    behind: 0,
    has_upstream: true,
  };
  const responses = {
    load_settings: prefs,
    load_workspace: {},
    discover_repositories: [repo],
    job_history: { jobs: [] },
    sync_status: {
      branch: "main",
      path: "/fixture/dotfiles",
      changes: "",
      diff: "",
      upstream: "0 0",
    },
    system_health: {
      checkedAt: Date.now(),
      disk: { available: true, output: "disk" },
      userServices: { available: true, output: "" },
      systemServices: { available: true, output: "" },
      updates: { available: true, output: "" },
      batteries: [],
      tools: [],
      backup: { available: false, error: "offline" },
      readiness: [],
    },
    repository_details: { files: [], commits: [], diff: "" },
    load_configuration: {
      kind: "ghostty",
      path: "/fixture/config",
      livePath: "/fixture/config",
      managed: false,
      revision: "original",
      content: "font-size = 13\n",
    },
    prepare_job: {
      id: "review-token",
      title: "Fetch fixture",
      program: "git",
      args: ["fetch"],
      cwd: "/fixture/repo",
      explanation: "Refresh remote status",
    },
    start_job: "job-1",
    ...overrides,
  };
  const dom = new JSDOM(html, {
    url: "http://localhost/",
    runScripts: "outside-only",
  });
  const w = dom.window;
  w.matchMedia = () => ({ matches: false, addEventListener() {} });
  // xterm probes canvas when imported; terminal rendering is covered in the browser.
  w.HTMLCanvasElement.prototype.getContext = () => null;
  w.setInterval = () => 0;
  w.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  w.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  w.__TAURI__ = {
    core: {
      invoke: async (command, args) => {
        calls.push({ command, args });
        const response = responses[command];
        if (response instanceof Error) throw response;
        if (typeof response === "function") return response(args);
        return structuredClone(response);
      },
    },
  };
  w.eval(code);
  await settle();
  return { w, calls, dom, responses, $: (s) => w.document.querySelector(s) };
}
async function settle() {
  for (let i = 0; i < 15; i++)
    await new Promise((resolve) => setTimeout(resolve, 0));
}
const submit = (w, element) =>
  element.dispatchEvent(
    new w.Event("submit", { bubbles: true, cancelable: true }),
  );

test("repository action requires review, cancel never starts it, confirmation uses prepared token", async () => {
  const x = await setup();
  try {
    x.$('[data-view="repositories"]').click();
    x.$("[data-details]").click();
    await settle();
    x.$('[data-repo-job="fetch"]').click();
    await settle();
    assert.equal(x.$("#review-dialog").open, true);
    assert.equal(x.calls.filter((c) => c.command === "start_job").length, 0);
    x.$("#review-cancel").click();
    await settle();
    assert.equal(x.calls.filter((c) => c.command === "start_job").length, 0);
    x.$("[data-details]").click();
    await settle();
    x.$('[data-repo-job="fetch"]').click();
    await settle();
    submit(x.w, x.$("#review-form"));
    await settle();
    assert.equal(
      x.calls.find((c) => c.command === "start_job").args.id,
      "review-token",
    );
    assert.equal(x.$("#activity-view").classList.contains("active-view"), true);
  } finally {
    x.dom.window.close();
  }
});
test("settings round trip retains integrations and launch profiles persist groups", async () => {
  const x = await setup();
  try {
    x.$('[data-view="settings"]').click();
    x.$("#integration-flakeProfile").value = "commander";
    x.$("#preferences-form").dispatchEvent(new x.w.Event("input"));
    submit(x.w, x.$("#preferences-form"));
    await settle();
    const saved = x.calls.find((c) => c.command === "save_settings");
    assert.equal(saved.args.settings.integrations.flakeProfile, "commander");
    assert.equal(
      saved.args.settings.integrations.dotfilesPath,
      "/fixture/dotfiles",
    );
    x.$("[data-details]").click();
    await settle();
    x.$("#project-group").value = "System";
    submit(x.w, x.$("#project-form"));
    await settle();
    assert.equal(
      x.calls.find((c) => c.command === "save_project").args.project.group,
      "System",
    );
    assert.match(x.$("#repo-group").textContent, /System/);
  } finally {
    x.dom.window.close();
  }
});
test("configuration preview stays a draft and save sends the original revision", async () => {
  const x = await setup({ save_configuration: "Saved" });
  try {
    x.$('[data-view="config"]').click();
    await settle();
    x.$('[data-ghostty="font-size"]').value = "18";
    submit(x.w, x.$("#ghostty-controls"));
    await settle();
    assert.match(x.$("#config-text").value, /font-size = 18/);
    assert.equal(
      x.calls.some((c) => c.command === "save_configuration"),
      false,
    );
    x.$("#config-save").click();
    await settle();
    assert.equal(x.$("#review-dialog").open, true);
    submit(x.w, x.$("#review-form"));
    await settle();
    const saved = x.calls.find((c) => c.command === "save_configuration");
    assert.equal(saved.args.revision, "original");
    assert.match(saved.args.content, /font-size = 18/);
  } finally {
    x.dom.window.close();
  }
});
test("backend failures remain visible and do not mark a job as started", async () => {
  const x = await setup({
    prepare_job: new Error("Commit or stash changes before pulling"),
  });
  try {
    x.$("[data-details]").click();
    await settle();
    x.$('[data-repo-job="pull"]').click();
    await settle();
    assert.match(x.$("#toast-message").textContent, /Commit or stash/);
    assert.equal(
      x.calls.some((c) => c.command === "start_job"),
      false,
    );
  } finally {
    x.dom.window.close();
  }
});

test("snapshot results load through the result endpoint after a completed job", async () => {
  const x = await setup({
    job_result: {
      result:
        '[{"id":"a1b2c3d4","short_id":"a1b2c3d4","time":"2026-09-20T12:00:00Z","hostname":"fixture","paths":["/fixture"]}]',
      output: "diagnostic text",
    },
  });
  try {
    x.$('[data-view="backup"]').click();
    x.$("#load-snapshots").click();
    await settle();
    submit(x.w, x.$("#review-form"));
    await settle();
    x.responses.job_history = {
      jobs: [
        {
          id: "job-1",
          title: "Snapshots",
          status: "succeeded",
          command: "restic snapshots",
          cwd: "/fixture",
          startedAt: Date.now() - 1000,
          finishedAt: Date.now(),
          exitCode: 0,
          output: "",
        },
      ],
    };
    x.$("#activity-refresh").click();
    await settle();
    assert.match(x.$("#snapshots").textContent, /fixture/);
    x.$("[data-snapshot]").click();
    assert.equal(x.$("#restore-snapshot").value, "a1b2c3d4");
    assert.equal(
      x.calls.some((c) => c.command === "job_result"),
      true,
    );
  } finally {
    x.dom.window.close();
  }
});

const toolboxCatalog = {
  revision: "fixture-revision",
  actions: [
    {
      id: '["Applications Setup","Myfish Shell Setup","Fish"]',
      name: "Myfish Fish",
      description: "Native shell setup",
      category: "Applications Setup",
      groups: ["Myfish Shell Setup"],
      available: true,
      multiSelect: false,
      taskList: "I FM MP",
    },
    {
      id: "unavailable",
      name: "Unavailable fixture",
      description: "Requires another system",
      category: "Utilities",
      groups: [],
      available: false,
    },
  ],
};
test("Toolbox filters unavailable actions, persists favorites and reviews the catalog ID before launch", async () => {
  const x = await setup({ toolbox_catalog: toolboxCatalog });
  try {
    x.$('[data-view="toolbox"]').click();
    await settle();
    assert.equal(x.w.document.querySelectorAll("[data-folder]").length, 1);
    assert.equal(x.w.document.querySelectorAll("[data-tool]").length, 0);
    x.$('[aria-label="Open folder Applications Setup"]').click();
    x.$('[aria-label="Open folder Myfish Shell Setup"]').click();
    assert.equal(x.w.document.querySelectorAll("[data-tool]").length, 1);
    assert.match(x.$("#toolbox-source").textContent, /2 tools.*1 available/);
    assert.match(
      x.$("#toolbox-detail").textContent,
      /Installation.*File changes.*Package manager/,
    );
    x.$("#toolbox-favorite").click();
    assert.equal(
      JSON.parse(
        x.w.localStorage.getItem("command-center.toolbox-favorites"),
      )[0],
      toolboxCatalog.actions[0].id,
    );
    x.$("#toolbox-available").click();
    x.$('[data-depth="0"]').click();
    assert.equal(x.w.document.querySelectorAll("[data-folder]").length, 2);
    x.$('[aria-label="Open folder Utilities"]').click();
    x.$('[data-tool="unavailable"]').click();
    assert.equal(x.$("#toolbox-run").disabled, true);
    assert.equal(
      x.calls.some((c) => c.command === "prepare_job"),
      false,
    );
    x.$('[data-depth="0"]').click();
    x.$("#toolbox-favorites").click();
    assert.equal(x.w.document.querySelectorAll("[data-tool]").length, 1);
    x.$("#toolbox-terminal").value = "external";
    x.$("#toolbox-run").click();
    await settle();
    const request = x.calls.find((c) => c.command === "prepare_job").args
      .request;
    assert.equal(request.action, "toolbox");
    assert.equal(request.toolId, toolboxCatalog.actions[0].id);
    assert.equal(request.terminalMode, "external");
    x.$("#review-cancel").click();
    await settle();
    assert.equal(
      x.calls.some((c) => c.command === "start_job"),
      false,
    );
    x.$("#toolbox-run").click();
    await settle();
    submit(x.w, x.$("#review-form"));
    await settle();
    assert.equal(
      x.calls.find((c) => c.command === "start_job").args.id,
      "review-token",
    );
  } finally {
    x.dom.window.close();
  }
});
test("Toolbox refresh failures remain visible and recover without replacing the catalog with an empty success", async () => {
  const x = await setup({ toolbox_catalog: new Error("Catalog unavailable") });
  try {
    x.$('[data-view="toolbox"]').click();
    await settle();
    assert.match(
      x.$("#toolbox-feedback").textContent,
      /Could not refresh.*Catalog unavailable/,
    );
    assert.equal(x.$("#toolbox-refresh").disabled, false);
    x.responses.toolbox_catalog = toolboxCatalog;
    x.$("#toolbox-refresh").click();
    await settle();
    assert.equal(x.w.document.querySelectorAll("[data-folder]").length, 1);
  } finally {
    x.dom.window.close();
  }
});

test("nested Toolbox folders scope search, reveal results and navigate up without launching", async () => {
  const nested = (id, group) => ({
    id,
    name: id,
    category: "Gaming",
    groups: ["Emulators", group],
    description: "Game emulator",
    available: true,
  });
  const x = await setup({
    toolbox_catalog: {
      revision: "fixture",
      actions: [nested("Dolphin", "Nintendo"), nested("Flycast", "Sega")],
    },
  });
  try {
    x.$('[data-view="toolbox"]').click();
    await settle();
    x.$('[aria-label="Open folder Gaming"]').click();
    x.$('[aria-label="Open folder Emulators"]').click();
    assert.equal(x.w.document.querySelectorAll("[data-folder]").length, 2);
    x.$('[aria-label="Open folder Nintendo"]').click();
    assert.equal(x.$('[data-tool="Flycast"]'), null);
    assert.equal(
      x.$('#toolbox-breadcrumbs [aria-current="page"]').textContent,
      "Nintendo",
    );
    x.$("#toolbox-back").click();
    assert.equal(x.w.document.querySelectorAll("[data-folder]").length, 2);
    x.$("#toolbox-search").value = "Flycast";
    x.$("#toolbox-search").dispatchEvent(new x.w.Event("input"));
    assert.equal(x.w.document.querySelectorAll("[data-tool]").length, 1);
    x.$("#toolbox-reveal").click();
    assert.equal(
      x.$('#toolbox-breadcrumbs [aria-current="page"]').textContent,
      "Sega",
    );
    assert.equal(x.$("#toolbox-search").value, "");
    x.$('[data-depth="1"]').click();
    assert.equal(
      x.$('#toolbox-breadcrumbs [aria-current="page"]').textContent,
      "Gaming",
    );
    assert.equal(
      x.calls.some((c) => ["prepare_job", "start_job"].includes(c.command)),
      false,
    );
  } finally {
    x.dom.window.close();
  }
});

test('settings search leaves drafts intact and section links clear the filter', async () => {
  const x = await setup();
  try {
    x.$('[data-view="settings"]').click();
    x.$('#pref-name').value = 'Draft name';
    x.$('#pref-name').dispatchEvent(new x.w.Event('input', { bubbles: true }));
    x.$('#settings-search').value = 'backup';
    x.$('#settings-search').dispatchEvent(new x.w.Event('input'));
    assert.equal(x.$('#section-general').hidden, true);
    assert.equal(x.$('#section-integrations').hidden, false);
    assert.equal(x.$('#pref-name').value, 'Draft name');
    x.$('#settings-search').value = 'no-such-setting';
    x.$('#settings-search').dispatchEvent(new x.w.Event('input'));
    assert.equal(x.$('#settings-no-results').hidden, false);
    x.$('.settings-links a').click();
    assert.equal(x.$('#section-general').hidden, false);
    assert.equal(x.$('#settings-no-results').hidden, true);
    assert.equal(x.calls.filter(c => c.command === 'save_settings').length, 0);
  } finally { x.dom.window.close(); }
});

test('all navigation pages can be saved as the startup page and reopened', async () => {
  const x = await setup();
  try {
    x.$('[data-view="settings"]').click();
    const pages = [...x.$('#pref-startup').options].map(o => o.value);
    for (const page of pages) {
      assert.equal(normalize({ startupPage: page }).startupPage, page);
    }
    x.$('#pref-startup').value = 'toolbox';
    x.$('#pref-startup').dispatchEvent(new x.w.Event('change', { bubbles: true }));
    submit(x.w, x.$('#preferences-form'));
    await settle();
    const saved = x.calls.find(c => c.command === 'save_settings').args.settings;
    assert.equal(saved.startupPage, 'toolbox');
    const reopened = await setup({ load_settings: saved });
    try { assert.equal(reopened.$('#toolbox-view').classList.contains('active-view'), true); }
    finally { reopened.dom.window.close(); }
  } finally { x.dom.window.close(); }
});

test('availability checks use drafts, report errors, and discard stale responses', async () => {
  let resolve;
  const x = await setup({ check_integrations: () => new Promise(r => { resolve = r; }) });
  try {
    x.$('#integration-dotfilesPath').value = '/draft';
    x.$('#check-integrations').click();
    await settle();
    assert.equal(x.calls.find(c => c.command === 'check_integrations').args.integrations.dotfilesPath, '/draft');
    assert.equal(x.$('#check-integrations').disabled, true);
    x.$('#integration-dotfilesPath').value = '/new-draft';
    x.$('#integration-dotfilesPath').dispatchEvent(new x.w.Event('input', { bubbles: true }));
    resolve([{ label: 'Old path', message: 'Present', status: 'available' }]);
    await settle();
    assert.equal(x.$('#integration-check-results').textContent, '');
    assert.match(x.$('#integration-check-status').textContent, /changed/);
    x.responses.check_integrations = new Error('Unavailable fixture');
    x.$('#check-integrations').click();
    await settle();
    assert.match(x.$('#integration-check-status').textContent, /Check failed/);
    assert.equal(x.$('#check-integrations').disabled, false);
    x.responses.check_integrations = [{ label: '<script>', message: 'Not configured', status: 'unknown' }];
    x.$('#check-integrations').click();
    await settle();
    assert.equal(x.$('#integration-check-results script'), null);
    assert.match(x.$('#integration-check-results').textContent, /Not configured/);
    assert.equal(x.calls.filter(c => c.command === 'save_settings').length, 0);
  } finally { x.dom.window.close(); }
});

test('health failures mark old results stale and allow retry', async () => {
  const x = await setup();
  try {
    x.responses.system_health = new Error('offline');
    x.$('[data-health-refresh]').click();
    await settle();
    assert.match(x.$('#health-time').textContent, /stale/);
    assert.equal(x.$('#health-panels').getAttribute('aria-busy'), 'false');
    assert.equal(x.$('[data-health-refresh]').disabled, false);
  } finally { x.dom.window.close(); }
});

test('stage selection is reviewed, cancellation starts nothing, and paths remain literal', async () => {
  const x = await setup({ repository_details: {
    files: [{ path: 'a[1].txt', status: '??', staged: false, unstaged: true }], commits: [], stagedDiff: '', indexTree: 'empty', head: '', branchRef: 'refs/heads/main',
  } });
  try {
    x.$('[data-view="repositories"]').click(); x.$('[data-details]').click(); await settle();
    assert.equal(x.$('[data-git="stage"]').disabled, true);
    x.$('[data-git-file]').click(); x.$('[data-git="stage"]').click(); await settle();
    const request = x.calls.find(c => c.command === 'prepare_job').args.request;
    assert.equal(request.action, 'stage');
    assert.deepEqual(Array.from(request.files), ['a[1].txt']);
    x.$('#review-cancel').click(); await settle();
    assert.equal(x.calls.filter(c => c.command === 'start_job').length, 0);
    assert.match(x.$('#git-change-status').textContent, /Cancelled/);
  } finally { x.dom.window.close(); }
});

test('commit review carries the staged snapshot and never automatically pushes', async () => {
  const x = await setup({ repository_details: {
    files: [{ path: 'file', status: 'MM', staged: true, unstaged: true }], commits: [], stagedDiff: '+staged text', indexTree: 'tree-1', head: 'head-1', branchRef: 'refs/heads/main',
  } });
  try {
    x.$('[data-view="repositories"]').click(); x.$('[data-details]').click(); await settle();
    assert.match(x.$('#staged-diff').textContent, /staged text/);
    assert.equal(x.$('#commit-staged').disabled, true);
    x.$('#commit-message').value = 'Save selected changes';
    x.$('#commit-message').dispatchEvent(new x.w.Event('input'));
    submit(x.w, x.$('#commit-form')); await settle();
    const request = x.calls.find(c => c.command === 'prepare_job').args.request;
    assert.equal(request.action, 'commit'); assert.equal(request.message, 'Save selected changes');
    assert.equal(request.indexTree, 'tree-1'); assert.equal(request.expectedHead, 'head-1');
    assert.equal(request.branchRef, 'refs/heads/main');
    submit(x.w, x.$('#review-form')); await settle();
    assert.equal(x.calls.filter(c => c.command === 'start_job').length, 1);
    assert.equal(x.calls.some(c => c.command === 'prepare_job' && c.args.request.action === 'push'), false);
    x.$('#refresh-git-details').click(); await settle();
    assert.equal(x.$('#commit-message').value, 'Save selected changes');
  } finally { x.dom.window.close(); }
});

test('Git preparation errors stay visible and retain the commit message', async () => {
  const x = await setup({ repository_details: {
    files: [{ path: 'file', status: 'M ', staged: true, unstaged: false }], commits: [], stagedDiff: 'diff', indexTree: 'tree', head: 'head', branchRef: 'refs/heads/main',
  }, prepare_job: new Error('Staged contents changed. Refresh Details.') });
  try {
    x.$('[data-view="repositories"]').click(); x.$('[data-details]').click(); await settle();
    x.$('#commit-message').value = 'Keep this draft'; x.$('#commit-message').dispatchEvent(new x.w.Event('input'));
    submit(x.w, x.$('#commit-form')); await settle();
    assert.match(x.$('#git-change-status').textContent, /Staged contents changed/);
    assert.equal(x.$('#commit-message').value, 'Keep this draft');
    assert.equal(x.calls.some(c => c.command === 'start_job'), false);
  } finally { x.dom.window.close(); }
});
