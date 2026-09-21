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
