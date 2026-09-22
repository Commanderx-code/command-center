import {
  defaultCollection,
  weeklyRecipe,
  stepTypes,
  toolFolderItems,
  advanceRun,
  restoreRun,
  timelineFilter,
} from "./operations-model.js";
export function createOperations({
  state,
  $,
  escapeHtml: e,
  run,
  action,
  review,
  switchView,
  toast,
}) {
  const btn = (text, id) =>
    `<button type="button" class="secondary-button" id="${id}">${text}</button>`;
  $(".main-nav").insertAdjacentHTML(
    "beforeend",
    '<button class="nav-item" data-view="operations"><span>▸</span>Workflows</button><button class="nav-item" data-view="timeline"><span>◷</span>Change timeline</button>',
  );
  $("main").insertAdjacentHTML(
    "beforeend",
    `<section id="operations-view" class="view"><div class="module-heading"><div><p class="eyebrow">Workstation routines</p><h2>Workflows & machine profiles</h2><p>Save a sequence, review each command, and follow its results. Failed steps stop the sequence.</p></div>${btn("Refresh saved definitions", "operations-refresh")}</div><p id="operations-status" role="status"></p><div class="module-columns"><section class="panel module-panel"><h3>Maintenance workflows</h3><div id="workflow-list"></div>${btn("New workflow", "workflow-new")}${btn("Add weekly maintenance example", "workflow-example")}</section><section class="panel module-panel"><h3>Machine profiles</h3><p>Combine repositories, Toolbox installers, and configuration steps. Presence checks guide your review; they do not prove configuration is correct.</p><div id="profile-list"></div>${btn("New machine profile", "profile-new")}</section></div><section id="recipe-progress" class="panel module-panel" hidden></section><section id="profile-assessment" class="panel module-panel" hidden></section></section>
 <section id="timeline-view" class="view"><div class="module-heading"><div><h2>Change timeline</h2><p>App-recorded operations and configuration backups. External changes are not monitored. Up to 100 jobs plus retained configuration history.</p></div>${btn("Refresh timeline", "timeline-refresh")}</div><div class="toolbar panel"><input id="timeline-search" type="search" aria-label="Search timeline" placeholder="Search changes…"><select id="timeline-category" aria-label="Timeline category"><option value="">All categories</option></select></div><p id="timeline-status" role="status"></p><div id="timeline-list" class="panel module-panel"></div></section>
 <dialog id="recipe-dialog" class="review-dialog"><form id="recipe-form" class="stack-form"><h2 id="recipe-title">New workflow</h2><label>Name<input id="recipe-name" required maxlength="80"></label><div id="profile-config-fields"><label>Dotfiles checkout for this machine<input id="profile-dotfiles" placeholder="Use current Settings if blank"></label><label>Home Manager profile<input id="profile-flake" placeholder="Use current Settings if blank"></label></div><ol id="recipe-steps"></ol><fieldset><legend>Add a step</legend><label>Action<select id="recipe-action">${Object.entries(
   stepTypes,
 )
   .map(([id, name]) => `<option value="${id}">${name}</option>`)
   .join(
     "",
   )}</select></label><label id="step-path-label">Repository folder<input id="step-path" placeholder="~/github/projects/example"></label><label id="step-remote-label">Repository URL<input id="step-remote" placeholder="https://github.com/owner/repo.git"></label><label id="step-target-label">Clone destination<input id="step-target" placeholder="~/github/projects/new-repo"></label><label id="step-choice-label">Choose tool<select id="step-choice"></select></label><label>Optional presence check<input id="step-present" placeholder="~/path/expected-after-setup"><small>A present path is a hint for profile review; it never skips execution automatically.</small></label>${btn("Add step", "recipe-add-step")}</fieldset><p id="recipe-error" role="status"></p><div class="button-row"><button class="primary-button">Save recipe</button>${btn("Cancel", "recipe-cancel")}</div></form></dialog>
 <dialog id="personal-tool-dialog" class="review-dialog"><form id="personal-tool-form" class="stack-form"><h2>Personal tool</h2><label>Name<input id="personal-name" required maxlength="80"></label><label>Folder<input id="personal-folder" placeholder="Maintenance / Backups"></label><label>Description<textarea id="personal-description" maxlength="2000"></textarea></label><label>Command<input id="personal-command" required placeholder="git -C {repo} status"><small>Inputs occupy a complete argument, such as {repo}. Arguments are passed literally. For shell scripts, use a script file as the command.</small></label><label>Working folder<input id="personal-directory" value="~" required></label><label>Required executable<input id="personal-prerequisite" placeholder="git"></label><label>Run in<select id="personal-mode"><option value="embedded">Embedded terminal</option><option value="external">External terminal</option><option value="background">Background</option></select></label><fieldset><legend>Structured inputs</legend><div id="personal-inputs"></div><div class="button-row"><input id="input-name" placeholder="repo" aria-label="Input name"><input id="input-label" placeholder="Repository" aria-label="Input label"><select id="input-kind" aria-label="Input type"><option value="repository">Repository folder</option><option value="folder">Existing folder</option><option value="text">Text</option></select>${btn("Add input", "personal-add-input")}</div></fieldset><p id="personal-error" role="status"></p><div class="button-row"><button class="primary-button">Save tool</button>${btn("Cancel", "personal-cancel")}</div></form></dialog>
 <dialog id="tool-input-dialog" class="review-dialog"><form id="tool-input-form" class="stack-form"><h2 id="tool-input-title"></h2><div id="tool-input-fields"></div><div class="button-row"><button class="primary-button">Review command</button>${btn("Cancel", "tool-input-cancel")}</div></form></dialog>`,
  );
  $("#toolbox-view").insertAdjacentHTML(
    "beforeend",
    `<section class="panel module-panel"><div class="panel-heading"><div><h3>Personal tools</h3><p>Your own folders, scripts, prerequisites, and inputs.</p></div>${btn("Add personal tool", "personal-new")}</div><div class="toolbar"><span id="personal-breadcrumb"></span>${btn("Up", "personal-up")}<input id="personal-search" type="search" aria-label="Search personal tools" placeholder="Search this folder…"></div><div id="personal-list"></div></section>`,
  );
  $("#backup-view").insertAdjacentHTML(
    "beforeend",
    `<section class="panel module-panel"><h3>Recovery verification</h3><p>Record a checksum for a small file, back it up with your normal helper, then test that snapshot. Only the chosen file is restored into a temporary directory and compared. A changed file may need a new baseline.</p><form id="baseline-form" class="button-row"><input id="baseline-path" required placeholder="~/Documents/recovery-probe.txt" aria-label="File to record for recovery"><button class="secondary-button">Record checksum</button></form><form id="recovery-test-form" class="stack-form"><label>Recorded file<select id="recovery-baseline"></select></label><label>Snapshot ID<input id="recovery-snapshot" required pattern="[a-fA-F0-9]{8,64}" placeholder="Paste the ID from your snapshots"></label><button class="primary-button">Review recovery test</button></form><p id="recovery-test-status" role="status"></p><div id="recovery-results"></div></section>`,
  );
  $("#settings-view").insertAdjacentHTML(
    "beforeend",
    `<section class="panel module-panel"><h3>Desktop notifications & tray</h3><p>Notifications run while Command Center is open, including when hidden from its tray menu. The close button exits normally. The desktop must provide a notification service and tray support.</p><form id="notification-form" class="stack-form"><label><input type="checkbox" id="notice-enabled"> Enable desktop notifications</label><label><input type="checkbox" id="notice-failures"> Failed tasks</label><label><input type="checkbox" id="notice-completions"> Completed tasks</label><label><input type="checkbox" id="notice-health"> Changed health alerts</label><div class="button-row"><label>Quiet hours start<input type="number" min="0" max="23" id="notice-start" value="22"></label><label>Quiet hours end<input type="number" min="0" max="23" id="notice-end" value="7"></label></div><small>Local time. Equal start and end disables quiet hours.</small><button class="secondary-button">Save notification preferences</button></form><p id="notice-status" role="status"></p></section>`,
  );
  let collection = defaultCollection(),
    loaded = false,
    loading = null,
    folder = "",
    catalog = [],
    recipeDraft = null,
    recipeKind = "workflows",
    toolDraft = null,
    inputResolve = null,
    current = null,
    rows = [],
    busy = false;
  const error = (id, err) => ($(id).textContent = String(err.message || err));
  const safe = (fn) => async (ev) => {
    try {
      await fn(ev);
    } catch (err) {
      toast(String(err.message || err), true);
    }
  };
  try {
    current = restoreRun(
      JSON.parse(localStorage.getItem("command-center-workflow-run") || "null"),
    );
  } catch {
    current = null;
  }
  function remember() {
    localStorage.setItem(
      "command-center-workflow-run",
      JSON.stringify(current),
    );
    renderProgress();
  }
  async function save(next) {
    await run("save_operations", { collection: next });
    collection = next;
    render();
  }
  async function load() {
    if (loading) return loading;
    loading = (async () => {
      try {
        const data = await run("load_operations");
        collection = data || defaultCollection();
        loaded = true;
        render();
        $("#operations-status").textContent = "Saved definitions loaded.";
      } catch (err) {
        error("#operations-status", err);
      } finally {
        loading = null;
      }
    })();
    return loading;
  }
  async function ensure() {
    if (!loaded) await load();
    if (!loaded)
      throw Error("Open the desktop app and load saved definitions first.");
  }
  function render() {
    for (const kind of ["workflows", "profiles"]) {
      $(kind === "workflows" ? "#workflow-list" : "#profile-list").innerHTML =
        collection[kind]
          .map(
            (r) =>
              `<article class="timer-row"><div><strong>${e(r.name)}</strong><small>${r.steps.length} steps</small></div><div class="button-row"><button type="button" class="secondary-button" data-recipe="${e(r.id)}" data-kind="${kind}" data-op="run">${kind === "profiles" ? "Review profile" : "Start workflow"}</button><button type="button" class="text-button" data-recipe="${e(r.id)}" data-kind="${kind}" data-op="edit">Edit</button><button type="button" class="text-button" data-recipe="${e(r.id)}" data-kind="${kind}" data-op="delete">Delete</button></div></article>`,
          )
          .join("") || "<p>No saved recipes yet.</p>";
    }
    renderTools();
    const n = collection.notifications;
    for (const key of ["enabled", "failures", "completions", "health"])
      $("#notice-" + key).checked = n[key];
    $("#notice-start").value = n.quietStart;
    $("#notice-end").value = n.quietEnd;
    renderProgress();
  }
  function renderTools() {
    const items = toolFolderItems(
      collection.tools,
      folder,
      $("#personal-search").value,
    );
    $("#personal-breadcrumb").textContent = folder || "All personal tools";
    $("#personal-up").disabled = !folder;
    $("#personal-list").innerHTML =
      items.folders
        .map(
          (f) =>
            `<button class="secondary-button" type="button" data-folder="${e(f)}">▣ ${e(f.split("/").at(-1))}</button>`,
        )
        .join("") +
      items.tools
        .map(
          (t) =>
            `<article class="timer-row"><div><strong>${e(t.name)}</strong><p>${e(t.description)}</p><small>${e(t.folder)}${t.prerequisite ? " · Requires " + e(t.prerequisite) : ""}</small></div><div class="button-row"><button type="button" class="secondary-button" data-personal="${e(t.id)}" data-op="run">Review & run</button><button type="button" class="text-button" data-personal="${e(t.id)}" data-op="edit">Edit</button><button type="button" class="text-button" data-personal="${e(t.id)}" data-op="delete">Delete</button></div></article>`,
        )
        .join("");
    if (!items.tools.length && !items.folders.length)
      $("#personal-list").textContent = "No tools in this folder.";
  }
  function renderSteps() {
    $("#recipe-steps").innerHTML = recipeDraft.steps
      .map(
        (s, i) =>
          `<li>${e(s.name)} <button type="button" class="text-button" data-remove-step="${i}">Remove</button>${i ? `<button type="button" class="text-button" data-up-step="${i}">Move up</button>` : ""}</li>`,
      )
      .join("");
  }
  async function editRecipe(kind, id) {
    await ensure();
    recipeKind = kind;
    recipeDraft = structuredClone(
      collection[kind].find((r) => r.id === id) || {
        id: "recipe-" + Date.now(),
        name: "",
        steps: [],
      },
    );
    $("#recipe-title").textContent =
      kind === "profiles" ? "Machine profile" : "Maintenance workflow";
    $("#recipe-name").value = recipeDraft.name;
    $("#profile-config-fields").hidden = kind !== "profiles";
    $("#profile-dotfiles").value = recipeDraft.dotfilesPath || "";
    $("#profile-flake").value = recipeDraft.flakeProfile || "";
    $("#recipe-error").textContent = "";
    renderSteps();
    await stepFields();
    $("#recipe-dialog").showModal();
  }
  async function stepFields() {
    const type = $("#recipe-action").value;
    $("#step-path-label").hidden = type !== "fetch";
    $("#step-remote-label").hidden = type !== "profile-clone";
    $("#step-target-label").hidden = type !== "profile-clone";
    $("#step-choice-label").hidden = ![
      "toolbox",
      "personal-tool",
      "custom",
      "tool-update",
    ].includes(type);
    let choices = [];
    if (type === "toolbox") {
      if (!catalog.length) {
        try {
          catalog = (await run("toolbox_catalog")).actions;
        } catch (err) {
          error("#recipe-error", err);
        }
      }
      choices = catalog.map((t) => [
        t.id,
        t.name + (t.available ? "" : " · unavailable"),
      ]);
    }
    if (type === "personal-tool")
      choices = collection.tools.map((t) => [t.id, t.name]);
    if (type === "custom")
      choices = (state.settings.customActions || []).map((t) => [t.id, t.name]);
    if (type === "tool-update")
      choices = [
        ["full-upgrade", "Fish full-upgrade"],
        ["topgrade", "Topgrade"],
        ["garuda", "Garuda update"],
        ["arch", "Arch update"],
        ["flatpak-user", "Flatpak user"],
        ["flatpak-system", "Flatpak system"],
      ];
    $("#step-choice").innerHTML = choices
      .map(([id, name]) => `<option value="${e(id)}">${e(name)}</option>`)
      .join("");
  }
  $("#recipe-add-step").addEventListener("click", () => {
    const type = $("#recipe-action").value,
      choice = $("#step-choice").value;
    const request = { action: type };
    if (type === "fetch") request.path = $("#step-path").value;
    if (type === "profile-clone") {
      request.remote = $("#step-remote").value;
      request.target = $("#step-target").value;
    }
    if (["toolbox", "tool-update"].includes(type)) {
      request.toolId = choice;
      request.terminalMode = "embedded";
    }
    if (["personal-tool", "custom"].includes(type)) request.customId = choice;
    recipeDraft.steps.push({
      name:
        stepTypes[type] +
        (choice
          ? " · " + $("#step-choice").selectedOptions[0].textContent
          : ""),
      request,
      satisfiedPath: $("#step-present").value,
    });
    renderSteps();
  });
  $("#recipe-steps").addEventListener("click", (ev) => {
    const r = ev.target.dataset.removeStep,
      u = ev.target.dataset.upStep;
    if (r !== undefined) recipeDraft.steps.splice(Number(r), 1);
    if (u !== undefined) {
      const i = Number(u);
      [recipeDraft.steps[i - 1], recipeDraft.steps[i]] = [
        recipeDraft.steps[i],
        recipeDraft.steps[i - 1],
      ];
    }
    renderSteps();
  });
  $("#recipe-action").addEventListener("change", () => void stepFields());
  $("#recipe-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    try {
      recipeDraft.name = $("#recipe-name").value;
      recipeDraft.dotfilesPath = $("#profile-dotfiles").value;
      recipeDraft.flakeProfile = $("#profile-flake").value;
      const next = structuredClone(collection);
      next[recipeKind] = next[recipeKind]
        .filter((r) => r.id !== recipeDraft.id)
        .concat(recipeDraft);
      await save(next);
      $("#recipe-dialog").close();
    } catch (err) {
      error("#recipe-error", err);
    }
  });
  $("#recipe-cancel").addEventListener("click", () =>
    $("#recipe-dialog").close(),
  );
  $("#workflow-new").addEventListener(
    "click",
    safe(() => editRecipe("workflows")),
  );
  $("#profile-new").addEventListener(
    "click",
    safe(() => editRecipe("profiles")),
  );
  $("#workflow-example").addEventListener(
    "click",
    safe(async () => {
      await ensure();
      if (collection.workflows.some((w) => w.id === "weekly-maintenance"))
        return;
      const next = structuredClone(collection);
      next.workflows.push(weeklyRecipe());
      await save(next);
    }),
  );
  function renderProgress() {
    const box = $("#recipe-progress");
    box.hidden = !current;
    if (!current) return;
    box.innerHTML = `<h3>${e(current.name)} · ${e(current.status)}</h3><ol>${current.rows.map((r, i) => `<li${i === current.index ? ' class="current-step"' : ""}>${e(r.name)} · ${e(r.status)}</li>`).join("")}</ol><p>Review each step after the previous one succeeds. Stopping prevents further steps; stop an active command in Activity.</p><div class="button-row">${current.status === "ready" ? btn("Review next step", "recipe-next") : ""}${["stopped", "interrupted"].includes(current.status) ? btn("Review retry of current step", "recipe-retry") : ""}${current.status === "ready" && current.profile ? btn("Skip inspected step", "recipe-skip") : ""}${!["succeeded", "stopped"].includes(current.status) ? btn("Stop sequence", "recipe-stop") : ""}${btn("Open Activity", "recipe-activity")}</div>`;
    $("#recipe-next")?.addEventListener("click", () => void nextStep());
    $("#recipe-retry")?.addEventListener("click", () => {
      current.status = "ready";
      remember();
    });
    $("#recipe-skip")?.addEventListener(
      "click",
      safe(async () => {
        if (
          await review(
            "Skip this profile step?",
            "Confirm that this item is already configured.",
            current.rows[current.index].name,
            "Skip step",
          )
        ) {
          current.rows[current.index].status = "skipped after review";
          current.index++;
          current.status =
            current.index === current.rows.length ? "succeeded" : "ready";
          remember();
        }
      }),
    );
    $("#recipe-stop")?.addEventListener("click", () => {
      current.status = "stopped";
      remember();
    });
    $("#recipe-activity")?.addEventListener("click", () =>
      switchView("activity"),
    );
  }
  async function nextStep() {
    if (busy || current?.status !== "ready") return;
    busy = true;
    const active = current;
    active.status = "reviewing";
    remember();
    try {
      const request = structuredClone(active.rows[active.index].request);
      if (active.profileId) request.profileId = active.profileId;
      if (request.action === "personal-tool") {
        const values = await toolInputs(
          collection.tools.find((t) => t.id === request.customId),
        );
        if (!values) {
          active.status = "ready";
          return;
        }
        request.inputs = values;
      }
      const id = await action(request, () => {});
      if (current !== active) return;
      if (id) {
        active.jobId = id;
        active.rows[active.index].status = "running";
        active.status = "running";
      } else active.status = "ready";
    } catch (err) {
      active.status = "stopped";
      active.rows[active.index].status = String(err.message || err);
    } finally {
      busy = false;
      remember();
    }
  }
  $("#operations-view").addEventListener(
    "click",
    safe(async (ev) => {
      const b = ev.target.closest("[data-recipe]");
      if (!b) return;
      await ensure();
      const recipe = collection[b.dataset.kind].find(
        (r) => r.id === b.dataset.recipe,
      );
      if (b.dataset.op === "edit") return editRecipe(b.dataset.kind, recipe.id);
      if (b.dataset.op === "delete") {
        if (
          await review(
            "Delete saved recipe?",
            "This removes its definition, not changes made by its commands.",
            recipe.name,
            "Delete",
          )
        ) {
          const next = structuredClone(collection);
          next[b.dataset.kind] = next[b.dataset.kind].filter(
            (r) => r.id !== recipe.id,
          );
          await save(next);
        }
        return;
      }
      if (current && ["running", "reviewing"].includes(current.status))
        throw Error("Finish or stop the active sequence first.");
      if (b.dataset.kind === "profiles") {
        const assessment = await run("assess_profile", { id: recipe.id });
        $("#profile-assessment").hidden = false;
        $("#profile-assessment").innerHTML =
          `<h3>${e(recipe.name)} · Current machine</h3>${assessment.map((r) => `<p><strong>${e(r.name)}</strong> · ${e(r.status)}<br>${e(r.detail)}</p>`).join("")}`;
      }
      current = {
        name: recipe.name,
        profile: b.dataset.kind === "profiles",
        profileId: b.dataset.kind === "profiles" ? recipe.id : "",
        index: 0,
        status: "ready",
        jobId: null,
        rows: structuredClone(recipe.steps).map((s) => ({
          ...s,
          status: "pending",
        })),
      };
      remember();
    }),
  );
  function renderInputs() {
    $("#personal-inputs").innerHTML = toolDraft.inputs
      .map(
        (f, i) =>
          `<p>${e(f.label)} · {${e(f.name)}} · ${e(f.kind)} <button type="button" class="text-button" data-remove-input="${i}">Remove</button></p>`,
      )
      .join("");
  }
  async function editTool(id) {
    await ensure();
    toolDraft = structuredClone(
      collection.tools.find((t) => t.id === id) || {
        id: "tool-" + Date.now(),
        name: "",
        folder,
        description: "",
        command: "",
        directory: "~",
        mode: "embedded",
        prerequisite: "",
        inputs: [],
      },
    );
    for (const key of [
      "name",
      "folder",
      "description",
      "command",
      "directory",
      "mode",
      "prerequisite",
    ])
      $("#personal-" + key).value = toolDraft[key];
    $("#personal-error").textContent = "";
    renderInputs();
    $("#personal-tool-dialog").showModal();
  }
  $("#personal-new").addEventListener(
    "click",
    safe(() => editTool()),
  );
  $("#personal-cancel").addEventListener("click", () =>
    $("#personal-tool-dialog").close(),
  );
  $("#personal-add-input").addEventListener("click", () => {
    toolDraft.inputs.push({
      name: $("#input-name").value,
      label: $("#input-label").value,
      kind: $("#input-kind").value,
    });
    renderInputs();
  });
  $("#personal-inputs").addEventListener("click", (ev) => {
    if (ev.target.dataset.removeInput !== undefined) {
      toolDraft.inputs.splice(Number(ev.target.dataset.removeInput), 1);
      renderInputs();
    }
  });
  $("#personal-tool-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    try {
      for (const key of [
        "name",
        "folder",
        "description",
        "command",
        "directory",
        "mode",
        "prerequisite",
      ])
        toolDraft[key] = $("#personal-" + key).value;
      toolDraft.folder = toolDraft.folder
        .split("/")
        .map((s) => s.trim())
        .filter(Boolean)
        .join("/");
      const next = structuredClone(collection);
      next.tools = next.tools
        .filter((t) => t.id !== toolDraft.id)
        .concat(toolDraft);
      await save(next);
      $("#personal-tool-dialog").close();
    } catch (err) {
      error("#personal-error", err);
    }
  });
  function toolInputs(tool) {
    if (!tool) throw Error("Personal tool no longer exists.");
    if (!tool.inputs.length) return Promise.resolve({});
    $("#tool-input-title").textContent = tool.name;
    $("#tool-input-fields").innerHTML = tool.inputs
      .map(
        (f, i) =>
          `<label>${e(f.label)}<input data-tool-value="${e(f.name)}" required maxlength="4096" placeholder="${f.kind === "text" ? "Value" : "~/folder"}"></label>`,
      )
      .join("");
    $("#tool-input-dialog").showModal();
    return new Promise((resolve) => {
      inputResolve = resolve;
    });
  }
  function finishInputs(values) {
    $("#tool-input-dialog").close();
    const resolve = inputResolve;
    inputResolve = null;
    resolve?.(values);
  }
  $("#tool-input-form").addEventListener("submit", (ev) => {
    ev.preventDefault();
    finishInputs(
      Object.fromEntries(
        [...$("#tool-input-fields").querySelectorAll("input")].map((el) => [
          el.dataset.toolValue,
          el.value,
        ]),
      ),
    );
  });
  $("#tool-input-cancel").addEventListener("click", () => finishInputs(null));
  $("#tool-input-dialog").addEventListener("cancel", () => finishInputs(null));
  $("#personal-list").addEventListener(
    "click",
    safe(async (ev) => {
      const f = ev.target.closest("[data-folder]");
      if (f) {
        folder = f.dataset.folder;
        renderTools();
        return;
      }
      const b = ev.target.closest("[data-personal]");
      if (!b) return;
      const t = collection.tools.find((t) => t.id === b.dataset.personal);
      if (b.dataset.op === "edit") return editTool(t.id);
      if (b.dataset.op === "delete") {
        if (
          await review(
            "Delete personal tool?",
            "Only the saved definition is removed.",
            t.name,
            "Delete",
          )
        ) {
          const next = structuredClone(collection);
          next.tools = next.tools.filter((v) => v.id !== t.id);
          await save(next);
        }
        return;
      }
      const inputs = await toolInputs(t);
      if (inputs)
        await action({ action: "personal-tool", customId: t.id, inputs });
    }),
  );
  $("#personal-up").addEventListener("click", () => {
    folder = folder.split("/").slice(0, -1).join("/");
    renderTools();
  });
  $("#personal-search").addEventListener("input", renderTools);
  async function baselines() {
    try {
      const list = await run("recovery_baselines");
      $("#recovery-baseline").innerHTML = (list || [])
        .map(
          (b) =>
            `<option value="${e(b.id)}">${e(b.path)} · ${new Date(b.recordedAt).toLocaleString()}</option>`,
        )
        .join("");
      const events = await run("change_timeline");
      const tests = (events || []).filter(
        (r) => r.category === "recovery-test",
      );
      $("#recovery-results").innerHTML =
        tests
          .slice(0, 10)
          .map(
            (r) =>
              `<p>${e(r.title)} · ${e(r.status)} · ${new Date(r.time).toLocaleString()}</p>`,
          )
          .join("") || "No recovery tests recorded yet.";
    } catch (err) {
      error("#recovery-test-status", err);
    }
  }
  $("#baseline-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const b = ev.target.querySelector("button");
    b.disabled = true;
    try {
      const baseline = await run("record_recovery_baseline", {
        path: $("#baseline-path").value,
      });
      $("#recovery-test-status").textContent =
        `Recorded SHA-256: ${baseline.sha256}. Back up this exact file version, then select that snapshot.`;
      await baselines();
    } catch (err) {
      error("#recovery-test-status", err);
    } finally {
      b.disabled = false;
    }
  });
  $("#recovery-test-form").addEventListener(
    "submit",
    safe(async (ev) => {
      ev.preventDefault();
      await action(
        {
          action: "recovery-test",
          customId: $("#recovery-baseline").value,
          snapshot: $("#recovery-snapshot").value,
        },
        async () => {
          await baselines();
        },
      );
    }),
  );
  function renderTimeline() {
    const visible = timelineFilter(
      rows,
      $("#timeline-search").value,
      $("#timeline-category").value,
    );
    $("#timeline-list").innerHTML =
      visible
        .map(
          (r) =>
            `<article class="timer-row"><div><strong>${e(r.title)}</strong><p>${e(r.category)} · ${e(r.status)}</p><small>${new Date(r.time).toLocaleString()} · ${e(r.detail)}</small></div></article>`,
        )
        .join("") || "<p>No matching recorded changes.</p>";
  }
  async function timeline() {
    try {
      rows = (await run("change_timeline")) || [];
      const selected = $("#timeline-category").value;
      $("#timeline-category").innerHTML =
        '<option value="">All categories</option>' +
        [...new Set(rows.map((r) => r.category))]
          .sort()
          .map((c) => `<option value="${e(c)}">${e(c)}</option>`)
          .join("");
      $("#timeline-category").value = selected;
      renderTimeline();
      $("#timeline-status").textContent = `${rows.length} recorded events`;
    } catch (err) {
      error("#timeline-status", err);
    }
  }
  $("#timeline-search").addEventListener("input", renderTimeline);
  $("#timeline-category").addEventListener("change", renderTimeline);
  $("#timeline-refresh").addEventListener("click", timeline);
  $("#notification-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    try {
      const preferences = {};
      for (const key of ["enabled", "failures", "completions", "health"])
        preferences[key] = $("#notice-" + key).checked;
      preferences.quietStart = Number($("#notice-start").value);
      preferences.quietEnd = Number($("#notice-end").value);
      await ensure();
      const next = structuredClone(collection);
      next.notifications = preferences;
      await save(next);
      $("#notice-status").textContent = "Notification preferences saved.";
    } catch (err) {
      error("#notice-status", err);
    }
  });
  $("#operations-refresh").addEventListener("click", load);
  render();
  return {
    onView(view) {
      if (["operations", "toolbox", "settings"].includes(view) && !loaded)
        void load();
      if (view === "backup") void baselines();
      if (view === "timeline") void timeline();
      if (view === "settings" && state.desktop)
        void run("desktop_status_info")
          .then((info) => {
            $("#notice-status").textContent =
              `Notifications: ${info?.notifications ? "available" : "install libnotify / notify-send"} · Tray: ${info?.tray ? "created; visibility depends on desktop" : "unavailable"}`;
          })
          .catch(() => {});
    },
    updateJobs(jobs) {
      if (!current?.jobId || current.status === "stopped") return;
      const job = jobs.find((j) => j.id === current.jobId);
      if (job) {
        current = advanceRun(current, job);
        remember();
      }
    },
    health(items) {
      const summary = items
        .filter((i) => !i.repository && !i.jobId)
        .map((i) => i.title)
        .sort()
        .join("; ")
        .slice(0, 400);
      if (state.desktop)
        void run("health_notification", { summary }).catch(() => {});
    },
  };
}
