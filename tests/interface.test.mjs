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
async function setup(overrides = {}, { storage = {} } = {}) {
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
  w.TextEncoder = TextEncoder;
  w.matchMedia = () => ({ matches: false, addEventListener() {} });
  // xterm probes canvas when imported; terminal rendering is covered in the browser.
  w.HTMLCanvasElement.prototype.getContext = () => null;
  w.setInterval = () => 0;
  w.requestAnimationFrame = callback => w.setTimeout(callback, 0);
  w.cancelAnimationFrame = id => w.clearTimeout(id);
  w.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  w.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  w.structuredClone = structuredClone;
  for (const [key, value] of Object.entries(storage)) w.localStorage.setItem(key, value);
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
    assert.equal(x.$("#repo-detail-dialog").open, true);
    assert.match(x.$("#git-change-status").textContent, /running/);
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
    assert.match(x.$("#git-change-status").textContent, /Commit or stash/);
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
    await settle();
    assert.deepEqual(
      [...x.calls.findLast((c) => c.command === "save_toolbox_favorites").args
        .favorites],
      [toolboxCatalog.actions[0].id],
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

test('file diff tabs ignore stale responses and display code as text', async () => {
  const waiting=[];
  const x=await setup({repository_details:{files:[{path:'one',status:'MM',staged:true,unstaged:true},{path:'two',status:' M',staged:false,unstaged:true}],commits:[],stagedDiff:'+initial',unstagedDiff:'-working'},repository_diff:args=>new Promise(resolve=>waiting.push({args,resolve}))});
  try {
    x.$('[data-view="repositories"]').click();x.$('[data-details]').click();await settle();
    x.$('[data-file-diff="0"]').click();await settle();
    x.$('[data-file-diff="1"]').click();await settle();
    waiting[1].resolve({text:'+<script>alert(1)</script>\n-removed',truncated:false});await settle();
    waiting[0].resolve({text:'+stale',truncated:false});await settle();
    assert.match(x.$('#file-diff').textContent,/<script>/);assert.equal(x.$('#file-diff script'),null);
    assert.ok(x.$('#file-diff .diff-add'));assert.ok(x.$('#file-diff .diff-remove'));
    assert.equal(waiting[1].args.staged,false);
    x.$('#diff-all').click();await settle();assert.match(x.$('#file-diff').textContent,/working/);
  } finally{x.dom.window.close();}
});
test('branch operations require a clean tree and carry the reviewed starting branch', async()=>{
  const x=await setup({repository_details:{files:[],commits:[],head:'head-1',branchRef:'refs/heads/main',branches:['main','feature']}});
  try{
    x.$('[data-view="repositories"]').click();x.$('[data-details]').click();await settle();
    x.$('#new-branch').value='feature/new';x.$('#new-branch').dispatchEvent(new x.w.Event('input'));
    x.$('[data-git="branch-create"]').click();await settle();
    const req=x.calls.find(c=>c.command==='prepare_job').args.request;
    assert.equal(req.branchName,'feature/new');assert.equal(req.expectedHead,'head-1');assert.equal(req.branchRef,'refs/heads/main');
    x.$('#review-cancel').click();await settle();
    x.responses.repository_details.files=[{path:'new',status:'??'}];x.$('#refresh-git-details').click();await settle();
    assert.equal(x.$('[data-git="branch-switch"]').disabled,true);
  }finally{x.dom.window.close();}
});
test('custom actions save through preferences and run only after command review',async()=>{
  const x=await setup();
  try{
    x.$('[data-view="settings"]').click();x.$('#add-custom-action').click();
    x.$('[data-field="name"]').value='Upgrade';x.$('[data-field="command"]').value='full-upgrade';
    x.$('[data-field="shell"]').value='fish';x.$('[data-field="mode"]').value='external';
    x.$('[data-field="command"]').dispatchEvent(new x.w.Event('input',{bubbles:true}));
    submit(x.w,x.$('#preferences-form'));await settle();
    const saved=x.calls.find(c=>c.command==='save_settings').args.settings;
    assert.equal(saved.customActions[0].shell,'fish');
    x.$('[data-custom-run]').click();await settle();
    assert.equal(x.calls.find(c=>c.command==='prepare_job').args.request.customId,saved.customActions[0].id);
    assert.equal(x.calls.some(c=>c.command==='start_job'),false);
    x.$('#review-cancel').click();await settle();
    x.responses.export_settings='/home/fixture/Downloads/settings.json';x.$('#export-settings').click();await settle();
    assert.match(x.$('#transfer-status').textContent,/Downloads/);
  }finally{x.dom.window.close();}
});
test('failed Git jobs show output in Details and preserve the commit draft',async()=>{
  const x=await setup();
  try{
    x.$('[data-view="repositories"]').click();x.$('[data-details]').click();await settle();
    x.$('#commit-message').value='Keep my message';x.$('#commit-message').dispatchEvent(new x.w.Event('input'));
    x.responses.job_history={jobs:[{id:'failure',action:'commit',cwd:'/fixture/repo',title:'Commit',status:'failed',output:'Author identity unknown',exitCode:128,finishedAt:Date.now()}]};
    x.$('#activity-refresh').click();await settle();
    assert.match(x.$('#git-change-status').textContent,/failed/);assert.match(x.$('#git-inline-output').textContent,/Author identity/);
    assert.equal(x.$('#commit-message').value,'Keep my message');
  }finally{x.dom.window.close();}
});

test('service controls review only user units and keep system units read-only',async()=>{
  const x=await setup({system_units:{units:[{unit:'backup.service',active:'inactive',sub:'dead',description:'Backup'}],checkedAt:Date.now()},unit_details:{details:'ActiveState=inactive',logs:'journal fixture'}});
  try{
    x.$('[data-view="services"]').click();await settle();x.$('[data-unit]').click();await settle();
    assert.match(x.$('#service-logs').textContent,/journal fixture/);
    x.$('[data-service-op="start"]').click();await settle();
    const req=x.calls.find(c=>c.command==='prepare_job').args.request;assert.equal(req.scope,'user');assert.equal(req.unit,'backup.service');assert.equal(req.action,'service-start');
    x.$('#review-cancel').click();await settle();assert.equal(x.calls.some(c=>c.command==='start_job'),false);
    x.$('#service-scope').value='system';x.$('#service-scope').dispatchEvent(new x.w.Event('change'));await settle();x.$('[data-unit]').click();await settle();
    assert.equal(x.$('[data-service-op]'),null);
  }finally{x.dom.window.close();}
});
test('timer schedule requires review and inventory exports the displayed report',async()=>{
  const report={format:'command-center-inventory',version:1,checkedAt:Date.now(),os:'Fixture Linux',memory:'MemTotal: 1000 kB',tools:{git:{available:true,output:'git fixture'}}};
  const x=await setup({system_units:{units:[],checkedAt:Date.now()},system_inventory:report,export_inventory:'/fixture/Downloads/report.json'});
  try{
    x.$('[data-view="backup"]').click();await settle();
    x.$('#schedule-frequency').value='weekly';x.$('#schedule-hour').value='4';x.$('#schedule-minute').value='15';submit(x.w,x.$('#schedule-form'));await settle();
    const req=x.calls.find(c=>c.command==='prepare_job').args.request;assert.equal(req.action,'schedule-save');assert.equal(req.schedule,'weekly');assert.equal(req.hour,4);assert.equal(req.minute,15);
    x.$('#review-cancel').click();await settle();assert.equal(x.calls.some(c=>c.command==='start_job'),false);
    x.$('[data-view="inventory"]').click();await settle();assert.match(x.$('#inventory-panels').textContent,/Fixture Linux/);
    x.$('#inventory-export').click();await settle();assert.equal(x.calls.find(c=>c.command==='export_inventory').args.report.os,'Fixture Linux');assert.match(x.$('#inventory-status').textContent,/report.json/);
  }finally{x.dom.window.close();}
});
test('configuration history comparison and restore cannot write without save',async()=>{
  const x=await setup({configuration_history:[{name:'ghostty-123.bak',bytes:15}],configuration_backup:'font-size = 17\n'});
  try{
    x.$('[data-view="config"]').click();await settle();x.$('#config-history-compare').click();await settle();
    assert.match(x.$('#history-backup').textContent,/17/);assert.match(x.$('#history-current').textContent,/13/);
    x.$('#config-history-restore').click();await settle();x.$('#review-cancel').click();await settle();assert.match(x.$('#config-text').value,/13/);
    x.$('#config-history-restore').click();await settle();submit(x.w,x.$('#review-form'));await settle();assert.match(x.$('#config-text').value,/17/);
    assert.equal(x.calls.some(c=>c.command==='save_configuration'),false);
  }finally{x.dom.window.close();}
});
test('stash restore and branch publishing use selected immutable ID and remote',async()=>{
  const x=await setup({repository_details:{files:[],commits:[],head:'head',branchRef:'refs/heads/feature',branches:['feature'],stashes:[{id:'abcdef',name:'stash@{0}',subject:'WIP'}],remotes:['origin','backup']}});
  try{
    x.$('[data-view="repositories"]').click();x.$('[data-details]').click();await settle();
    x.$('[data-git="stash-apply"]').click();await settle();let req=x.calls.filter(c=>c.command==='prepare_job').at(-1).args.request;assert.equal(req.stashId,'abcdef');assert.equal(req.action,'stash-apply');
    x.$('#review-cancel').click();await settle();x.$('#publish-remote').value='backup';x.$('[data-git="branch-publish"]').click();await settle();req=x.calls.filter(c=>c.command==='prepare_job').at(-1).args.request;assert.equal(req.remote,'backup');assert.equal(req.action,'branch-publish');
    x.$('#review-cancel').click();await settle();assert.equal(x.calls.some(c=>c.command==='start_job'),false);
  }finally{x.dom.window.close();}
});
test('command palette searches dynamically and does not interrupt a pending review',async()=>{
  const x=await setup();
  try{
    x.w.document.dispatchEvent(new x.w.KeyboardEvent('keydown',{key:'k',ctrlKey:true,bubbles:true,cancelable:true}));
    assert.equal(x.$('#command-palette').open,true);x.$('#palette-search').value='inventory';x.$('#palette-search').dispatchEvent(new x.w.Event('input'));
    assert.equal(x.$('#palette-results').children.length,1);x.$('#palette-results button').click();await settle();assert.equal(x.$('#inventory-view').classList.contains('active-view'),true);
    x.$('[data-view="repositories"]').click();x.$('[data-details]').click();await settle();x.$('[data-repo-job="fetch"]').click();await settle();assert.equal(x.$('#review-dialog').open,true);
    x.w.document.dispatchEvent(new x.w.KeyboardEvent('keydown',{key:'k',ctrlKey:true,bubbles:true,cancelable:true}));assert.equal(x.$('#command-palette').open,false);
    x.$('#review-cancel').click();await settle();
  }finally{x.dom.window.close();}
});

test('release checks are explicit, handle missing releases and failures, and never execute an updater', async()=>{
  const x=await setup({release_info:{installed:'0.4.0'},check_release:{installed:'0.4.0',release:null},export_update_helper:'/tmp/update-desktop.sh'});
  try{
    assert.equal(x.calls.some(c=>c.command==='check_release'),false);
    x.$('#release-check').click();await settle();assert.match(x.$('#release-status').textContent,/No published/);
    x.responses.check_release={installed:'0.4.0',release:{tag:'v0.5.0',notes:'<script>example</script>'}};
    x.$('#release-check').click();await settle();assert.match(x.$('#release-command').textContent,/v0.5.0/);assert.equal(x.$('#release-notes script'),null);
    x.$('#update-export').click();await settle();assert.match(x.$('#update-export-status').textContent,/does not run/);
    x.responses.check_release=new Error('offline');x.$('#release-check').click();await settle();assert.equal(x.$('#release-command').textContent,'');assert.match(x.$('#release-status').textContent,/offline/);
    assert.equal(x.calls.some(c=>c.command==='start_job'),false);
  }finally{x.dom.window.close();}
});

test('Restic access test requires review and cancellation starts no job',async()=>{
  const x=await setup();try{
    x.$('[data-job="restic-access"]').click();await settle();
    assert.equal(x.calls.find(c=>c.command==='prepare_job').args.request.action,'restic-access');
    assert.equal(x.$('#review-dialog').open,true);
    x.$('#review-cancel').click();await settle();assert.equal(x.calls.some(c=>c.command==='start_job'),false);
  }finally{x.dom.window.close();}
});

test('Toolbox update checks stay separate from catalog refresh and updates require review',async()=>{
 const x=await setup({toolbox_update_checks:{checkedAt:Date.now(),groups:[{name:'Arch',note:'Cached',check:{state:'results',output:'<script>not markup</script>'}}],workflows:{fullUpgrade:true,topgrade:true},manual:'Source builds need manual checks'},toolbox_catalog_update:{bundled:'a'.repeat(40),latest:'b'.repeat(40)}});
 try{
  assert.equal(x.calls.some(c=>c.command==='toolbox_update_checks'||c.command==='toolbox_catalog_update'),false);
  x.$('#installed-update-check').click();await settle();assert.equal(x.$('#installed-update-groups script'),null);
  x.$('[data-update-workflow="full-upgrade"]').click();await settle();
  const request=x.calls.find(c=>c.command==='prepare_job').args.request;
  assert.equal(request.action,'tool-update');assert.equal(request.toolId,'full-upgrade');assert.equal(request.terminalMode,'embedded');
  x.$('#review-cancel').click();await settle();assert.equal(x.calls.some(c=>c.command==='start_job'),false);
  x.$('#catalog-update-check').click();await settle();assert.match(x.$('#catalog-update-command').textContent,/npm run toolbox:pin/);
  x.responses.toolbox_catalog_update=new Error('offline');x.$('#catalog-update-check').click();await settle();assert.equal(x.$('#catalog-update-command').textContent,'');assert.equal(x.$('#catalog-update-compare').disabled,true);
  x.responses.toolbox_update_checks=new Error('unavailable');x.$('#installed-update-check').click();await settle();assert.equal(x.$('#installed-update-actions').children.length,0);assert.match(x.$('#installed-update-status').textContent,/unavailable/);
 }finally{x.dom.window.close();}
});

test('workflow review cancellation starts nothing and leaves next step ready', async () => {
 const recipe={id:'fixture',name:'Fixture workflow',steps:[{name:'Backup',request:{action:'backup'},satisfiedPath:''}]};
 const x=await setup({load_operations:{workflows:[recipe],profiles:[],tools:[],notifications:{enabled:false,quietStart:22,quietEnd:7}}});
 try {
 x.$('[data-view="operations"]').click();await settle();
 x.$('[data-recipe="fixture"][data-op="run"]').click();await settle();
 x.$('#recipe-next').click();await settle();
 assert.equal(x.calls.find(c=>c.command==='prepare_job').args.request.action,'backup');
 x.$('#review-cancel').click();await settle();
 assert.equal(x.calls.filter(c=>c.command==='start_job').length,0);
 assert.ok(x.$('#recipe-next'));
 } finally {x.dom.window.close();}
});

test('profile assessment does not run installers and renders untrusted names as text',async()=>{
 const recipe={id:'profile',name:'Laptop',steps:[{name:'Install',request:{action:'toolbox',toolId:'fixture'},satisfiedPath:''}]};
 const x=await setup({load_operations:{workflows:[],profiles:[recipe],tools:[],notifications:{}},assess_profile:[{name:'<script>alert(1)</script>',status:'Needs setup',detail:'Missing prerequisite'}]});
 try{x.$('[data-view="operations"]').click();await settle();x.$('[data-recipe="profile"][data-op="run"]').click();await settle();assert.equal(x.$('#profile-assessment script'),null);assert.match(x.$('#profile-assessment').textContent,/Missing prerequisite/);assert.equal(x.calls.filter(c=>c.command==='start_job').length,0);}finally{x.dom.window.close();}
});

test('project detection saves tasks without execution and task review cancellation starts nothing',async()=>{
  const task={id:'npm-test',name:'Test <script>',command:'npm run test',shell:'direct',mode:'embedded'};
  const x=await setup({detect_project_tasks:[task]});
  try{
    x.$('[data-details]').click();await settle();
    x.$('#task-detect').click();await settle();assert.equal(x.$('#task-suggestions script'),null);
    x.$('[data-suggestion]').click();await settle();
    const save=x.calls.find(c=>c.command==='save_project');assert.equal(save.args.project.tasks[0].command,'npm run test');
    assert.equal(x.calls.some(c=>c.command==='start_job'),false);
    x.$('[data-task][data-op="run"]').click();await settle();
    assert.equal(x.calls.find(c=>c.command==='prepare_job').args.request.action,'project-task');
    x.$('#review-cancel').click();await settle();assert.equal(x.calls.some(c=>c.command==='start_job'),false);
    submit(x.w,x.$('#project-form'));await settle();
    assert.equal(x.calls.filter(c=>c.command==='save_project').at(-1).args.project.tasks.length,1);
    x.$('[data-task][data-op="run"]').click();await settle();submit(x.w,x.$('#review-form'));await settle();
    assert.equal(x.$('#repo-detail-dialog').open,false);assert.equal(x.$('#terminal-view').classList.contains('active-view'),true);

  }finally{x.dom.window.close();}
});

test('setup wizard detects into a draft, checks it, and saves only after final review',async()=>{
  const x=await setup({setup_environment:{home:'/home/fixture',distribution:'Fixture Linux'},load_operations:{profiles:[]},detect_integrations:{backupScript:'/fixture/backup',dotfilesPath:'/other'},check_integrations:[{label:'restic',status:'missing',message:'Not installed'}]});
  try{
    x.$('#setup-open').click();await settle();assert.equal(x.$('#setup-dialog').open,true);
    x.$('#setup-next').click();await settle();x.$('#setup-detect').click();await settle();
    assert.equal(x.$('#setup-dotfilesPath').value,'/fixture/dotfiles');assert.equal(x.$('#setup-backupScript').value,'/fixture/backup');
    assert.equal(x.calls.some(c=>c.command==='save_settings'),false);
    x.$('#setup-next').click();await settle();x.$('#setup-check').click();await settle();
    assert.match(x.$('#setup-checks').textContent,/Not installed/);
    assert.equal(x.calls.find(c=>c.command==='check_integrations').args.integrations.backupScript,'/fixture/backup');
    x.$('#setup-next').click();await settle();assert.match(x.$('#setup-review').textContent,/\/fixture\/backup/);
    submit(x.w,x.$('#setup-form'));await settle();
    const saved=x.calls.find(c=>c.command==='save_settings').args.settings;assert.equal(saved.setupCompleted,true);assert.equal(saved.integrations.backupScript,'/fixture/backup');
    assert.equal(x.calls.some(c=>c.command==='start_job'),false);
  }finally{x.dom.window.close();}
});

const setupBundle=()=>({format:'command-center-setup',version:1,sourceHome:'/home/old',settings:normalize(),operations:{workflows:[],profiles:[],tools:[],notifications:{}},workspace:{},repositories:['/home/new/repo'],toolboxFavorites:['tool']});
test('bundle import needs preview and explicit replacement choice; changed paths invalidate consent',async()=>{
  const x=await setup({setup_environment:{home:'/home/new'},preview_setup_bundle:{bundle:setupBundle(),kept:[]}});
  try{
    const input=x.$('#bundle-file');Object.defineProperty(input,'files',{value:[{size:100,text:async()=>JSON.stringify(setupBundle())}],configurable:true});
    input.dispatchEvent(new x.w.Event('change'));await settle();
    assert.equal(x.$('#bundle-dialog').open,true);assert.equal(x.$('#bundle-apply').disabled,true);
    x.$('#bundle-consent').checked=true;x.$('#bundle-consent').dispatchEvent(new x.w.Event('change'));assert.equal(x.$('#bundle-apply').disabled,false);
    x.$('#bundle-home').value='/home/elsewhere';x.$('#bundle-home').dispatchEvent(new x.w.Event('input'));assert.equal(x.$('#bundle-apply').disabled,true);assert.equal(x.$('#bundle-consent').checked,false);
    x.$('#bundle-cancel').click();await settle();assert.equal(x.calls.some(c=>c.command==='import_setup_bundle'||c.command==='start_job'),false);
  }finally{x.dom.window.close();}
});
test('bundle preview arriving after a home edit cannot enable an unreviewed import',async()=>{
  let resolve;const pending=new Promise(r=>resolve=r);
  const x=await setup({setup_environment:{home:'/home/new'},preview_setup_bundle:()=>pending});
  try{
    const input=x.$('#bundle-file');Object.defineProperty(input,'files',{value:[{size:100,text:async()=>JSON.stringify(setupBundle())}]});input.dispatchEvent(new x.w.Event('change'));await settle();
    x.$('#bundle-home').value='/home/changed';x.$('#bundle-home').dispatchEvent(new x.w.Event('input'));resolve({bundle:setupBundle(),kept:[]});await settle();
    assert.equal(x.$('#bundle-content').textContent,'');assert.equal(x.$('#bundle-apply').disabled,true);
  }finally{x.dom.window.close();}
});
test('bundle import merges by default, reports kept items, and imports the reviewed mode',async()=>{
  const x=await setup({setup_environment:{home:'/home/new'},preview_setup_bundle:({mode})=>({bundle:{...setupBundle(),sourceHome:mode},kept:mode==='merge'?['Workflow “Nightly”']:[]}),import_setup_bundle:{token:'t',backup:'/backup.json'}});
  try{
    const input=x.$('#bundle-file');Object.defineProperty(input,'files',{value:[{size:100,text:async()=>JSON.stringify(setupBundle())}]});input.dispatchEvent(new x.w.Event('change'));await settle();
    assert.equal(x.calls.findLast(c=>c.command==='preview_setup_bundle').args.mode,'merge');
    assert.match(x.$('#bundle-kept').textContent,/kept unchanged \(1\): Workflow “Nightly”/);
    assert.match(x.$('#bundle-consent-text').textContent,/Add this preview/);
    const replace=x.$('input[name="bundle-mode"][value="replace"]');replace.checked=true;replace.dispatchEvent(new x.w.Event('change'));await settle();
    assert.equal(x.calls.findLast(c=>c.command==='preview_setup_bundle').args.mode,'replace');
    assert.equal(x.$('#bundle-kept').textContent,'');assert.match(x.$('#bundle-consent-text').textContent,/^Replace/);
    x.$('#bundle-consent').checked=true;x.$('#bundle-consent').dispatchEvent(new x.w.Event('change'));x.$('#bundle-apply').click();await settle();
    const call=x.calls.find(c=>c.command==='import_setup_bundle');assert.equal(call.args.mode,'replace');assert.equal(call.args.expected.sourceHome,'replace');
  }finally{x.dom.window.close();}
});
test('an interrupted import restored at launch is reported to the user',async()=>{
  const x=await setup({setup_import_state:{recovery:{restored:'/data/setup-backups/before-import-1.json'}}});
  try{assert.match(x.$('#bundle-status').textContent,/rolled back.*before-import-1\.json/);}finally{x.dom.window.close();}
});
test('webview Toolbox favorites migrate once to app data',async()=>{
  const x=await setup({toolbox_catalog:toolboxCatalog,load_toolbox_favorites:null},{storage:{'command-center.toolbox-favorites':'["legacy"]'}});
  try{
    x.$('[data-view="toolbox"]').click();await settle();
    assert.deepEqual([...x.calls.find(c=>c.command==='save_toolbox_favorites').args.favorites],['legacy']);
    assert.equal(x.w.localStorage.getItem('command-center.toolbox-favorites'),null);
  }finally{x.dom.window.close();}
});
test('a running job only locks repository actions in its own repository',async()=>{
  const running=cwd=>({jobs:[{id:'j',action:'project-task',title:'Build',status:'running',cwd,startedAt:Date.now(),output:''}]});
  const x=await setup({job_history:running('/other/repo')});
  try{
    x.$('[data-view="repositories"]').click();x.$('[data-details]').click();await settle();
    assert.equal(x.$('[data-repo-job="fetch"]').disabled,false);
    x.responses.job_history=running('/fixture/repo');x.$('[data-view="activity"]').click();x.$('[data-job-id="j"]').click();await settle();
    x.$('[data-view="repositories"]').click();x.$('[data-details]').click();await settle();
    assert.equal(x.$('[data-repo-job="fetch"]').disabled,true);
  }finally{x.dom.window.close();}
});
test('bundle export requires review and uses a separate format from settings exports',async()=>{
  const x=await setup({create_setup_bundle:setupBundle(),export_setup_bundle:'/downloads/setup.json'});
  try{
    x.$('#bundle-export').click();await settle();assert.equal(x.calls.some(c=>c.command==='export_setup_bundle'),false);
    assert.match(x.$('#bundle-content').textContent,/command-center-setup/);
    x.$('#bundle-apply').click();await settle();assert.equal(x.calls.filter(c=>c.command==='export_setup_bundle').length,1);assert.match(x.$('#bundle-status').textContent,/\/downloads\/setup.json/);
  }finally{x.dom.window.close();}
});
test('navigation exposes current page, keyboard arrows and main-content focus',async()=>{
  const x=await setup();try{
    const nav=x.$('[data-view="repositories"]');nav.click();await settle();assert.equal(nav.getAttribute('aria-current'),'page');assert.equal(x.w.document.activeElement.id,'view-title');
    nav.focus();nav.dispatchEvent(new x.w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));assert.notEqual(x.w.document.activeElement,nav);
    assert.equal(x.$('.skip-link').getAttribute('href'),'#main-content');
  }finally{x.dom.window.close();}
});
