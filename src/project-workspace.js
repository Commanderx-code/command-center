export function mountProjectWorkspace({
  target,
  path,
  project,
  save,
  invoke,
  action,
  escapeHtml: e,
  toast,
  openActivity,
  launch,
}) {
  let tasks = structuredClone(project.tasks || []),
    services = structuredClone(project.services || []),
    suggestions = [];
  let editing = null,
    busy = false;
  target.innerHTML = `<section class="panel module-panel"><div class="panel-heading"><div><p class="eyebrow">Project workspace</p><h3>Tasks & services</h3></div><button type="button" id="workspace-launch" class="secondary-button">Open workspace</button></div><p>Saved tasks run in this repository’s root. Review commands before each run. View output and stop running tasks in Activity.</p><div class="button-row"><button type="button" id="task-detect" class="secondary-button">Detect project tasks</button><button type="button" id="task-new" class="secondary-button">Add task</button><button type="button" id="workspace-activity" class="text-button">Open Activity</button></div><p id="task-status" role="status"></p><div id="task-suggestions"></div><div id="project-tasks"></div><form id="task-form" class="stack-form" hidden><h4 id="task-editor-title">Add task</h4><label>Name<input id="task-name" required maxlength="80"></label><label>Command<textarea id="task-command" required maxlength="4096" rows="2" spellcheck="false"></textarea></label><label>Shell<select id="task-shell"><option value="direct">Direct arguments</option><option value="fish">Fish</option><option value="bash">Bash</option></select></label><label>Run in<select id="task-mode"><option value="embedded">Embedded terminal</option><option value="background">Background</option><option value="external">External terminal</option></select></label><div class="button-row"><button type="submit" class="primary-button">Save task</button><button type="button" id="task-cancel" class="secondary-button">Cancel</button></div></form><h4>Related services</h4><div id="project-services"></div><form id="project-service-form" class="button-row"><label>Scope<select id="project-service-scope"><option value="user">User</option><option value="system">System</option></select></label><label>Service or timer<input id="project-service-unit" required placeholder="my-app.service" maxlength="200" pattern="[a-zA-Z0-9_.@:-]+"></label><button type="submit" class="secondary-button">Add service</button></form><pre id="project-service-details" class="output compact-output" hidden tabindex="0" aria-label="Service details and logs"></pre></section>`;
  const $ = (s) => target.querySelector(s);
  function render() {
    $("#project-tasks").innerHTML =
      tasks
        .map(
          (t) =>
            `<article class="timer-row"><div><strong>${e(t.name)}</strong><p><code>${e(t.command)}</code></p><small>${e(t.shell)} · ${e(t.mode)}</small></div><div class="button-row"><button type="button" class="secondary-button" data-task="${e(t.id)}" data-op="run">Review & run</button><button type="button" class="text-button" data-task="${e(t.id)}" data-op="edit">Edit</button><button type="button" class="text-button" data-task="${e(t.id)}" data-op="remove">Remove</button></div></article>`,
        )
        .join("") ||
      "<p>No tasks saved. Detect npm/Cargo tasks or add your own command.</p>";
    $("#project-services").innerHTML =
      services
        .map(
          (s, i) =>
            `<div class="timer-row"><span>${e(s.scope)} · ${e(s.unit)}</span><div class="button-row"><button type="button" class="secondary-button" data-service="${i}">Inspect</button><button type="button" class="text-button" data-remove-service="${i}">Remove</button></div></div>`,
        )
        .join("") || "<p>No linked services.</p>";
  }
  const safe = (fn) => async (ev) => {
    ev.preventDefault();
    if (busy) return;
    busy = true;
    try {
      await fn(ev);
    } catch (error) {
      $("#task-status").textContent = String(error.message || error);
    } finally {
      busy = false;
    }
  };
  async function persist(nextTasks, nextServices) {
    await save({ tasks: nextTasks, services: nextServices });
    tasks = nextTasks;
    services = nextServices;
    render();
    $("#task-status").textContent = "Workspace saved. No commands started.";
  }
  function edit(task) {
    editing = task?.id || `task-${Date.now()}`;
    $("#task-editor-title").textContent = task ? "Edit task" : "Add task";
    for (const key of ["name", "command", "shell", "mode"])
      $("#task-" + key).value =
        task?.[key] || { shell: "direct", mode: "embedded" }[key] || "";
    $("#task-form").hidden = false;
    $("#task-name").focus();
  }
  $("#task-new").addEventListener("click", () => edit());
  $("#task-cancel").addEventListener("click", () => {
    $("#task-form").hidden = true;
    $("#task-new").focus();
  });
  $("#task-form").addEventListener(
    "submit",
    safe(async () => {
      const task = {
        id: editing,
        ...Object.fromEntries(
          ["name", "command", "shell", "mode"].map((k) => [
            k,
            $("#task-" + k).value,
          ]),
        ),
      };
      await persist(
        tasks.filter((t) => t.id !== editing).concat(task),
        services,
      );
      $("#task-form").hidden = true;
      $("#task-new").focus();
    }),
  );
  $("#task-detect").addEventListener(
    "click",
    safe(async () => {
      if (!invoke) throw Error("Task detection requires the desktop app.");
      $("#task-status").textContent = "Reading project manifests…";
      suggestions = await invoke("detect_project_tasks", { path });
      if (!target.isConnected) return;
      $("#task-suggestions").innerHTML = suggestions
        .map(
          (t, i) =>
            `<p><code>${e(t.command)}</code> <button type="button" class="secondary-button" data-suggestion="${i}">Add ${e(t.name)}</button></p>`,
        )
        .join("");
      $("#task-status").textContent = suggestions.length
        ? "Suggestions only. Adding saves a definition; it does not run it. npm scripts can include pre/post hooks."
        : "No supported npm or Cargo tasks found. Add a custom task below.";
    }),
  );
  $("#task-suggestions").addEventListener(
    "click",
    safe(async (ev) => {
      const b = ev.target.closest("[data-suggestion]");
      if (!b) return;
      const task = suggestions[Number(b.dataset.suggestion)];
      if (tasks.some((t) => t.id === task.id))
        throw Error(
          "This suggested task is already saved. Edit it in the task list.",
        );
      await persist([...tasks, task], services);
      b.disabled = true;
    }),
  );
  $("#project-tasks").addEventListener(
    "click",
    safe(async (ev) => {
      const b = ev.target.closest("[data-task]");
      if (!b) return;
      const task = tasks.find((t) => t.id === b.dataset.task);
      if (!task) return;
      if (b.dataset.op === "edit") return edit(task);
      if (b.dataset.op === "remove")
        return persist(
          tasks.filter((t) => t.id !== task.id),
          services,
        );
      const id = await action(
        { action: "project-task", path, customId: task.id },
        () => {},
      );
      if (id) openActivity(task.mode === "embedded" ? "terminal" : "activity");
    }),
  );
  $("#project-service-form").addEventListener(
    "submit",
    safe(async () => {
      const service = {
        scope: $("#project-service-scope").value,
        unit: $("#project-service-unit").value.trim(),
      };
      if (
        services.some(
          (s) => s.scope === service.scope && s.unit === service.unit,
        )
      )
        throw Error("Service already linked.");
      await persist(tasks, [...services, service]);
      $("#project-service-unit").value = "";
    }),
  );
  $("#project-services").addEventListener(
    "click",
    safe(async (ev) => {
      const remove = ev.target.closest("[data-remove-service]");
      if (remove)
        return persist(
          tasks,
          services.filter((_, i) => i !== Number(remove.dataset.removeService)),
        );
      const inspect = ev.target.closest("[data-service]");
      if (!inspect) return;
      if (!invoke) throw Error("Service inspection requires the desktop app.");
      const box = $("#project-service-details");
      box.hidden = false;
      box.textContent = "Loading service…";
      try {
        const result = await invoke(
          "unit_details",
          services[Number(inspect.dataset.service)],
        );
        box.textContent = `${result.details}\n\n${result.logs || result.logError || "No journal entries."}`;
      } catch (err) {
        box.textContent = String(err.message || err);
      }
    }),
  );
  $("#workspace-launch").addEventListener("click", safe(launch));
  $("#workspace-activity").addEventListener("click", () => openActivity("activity"));
  render();
}
