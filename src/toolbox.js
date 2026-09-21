import {
  filterTools,
  setupTools,
  taskLabels,
  toolboxHint,
} from "./toolbox-model.js";
import { createTerminal } from "./terminal-ui.js";

export function createToolbox(api) {
  const { $, $$, escapeHtml: e, run, guard, action, state, switchView } = api;
  let catalog = null,
    loading = false,
    selected = null,
    category = "",
    favoritesOnly = false,
    jobs = [];
  let favorites = [];
  try {
    const saved = JSON.parse(
      localStorage.getItem("command-center.toolbox-favorites") || "[]",
    );
    if (Array.isArray(saved))
      favorites = saved.filter((id) => typeof id === "string");
  } catch {
    /* recover malformed local preferences */
  }
  $(".main-nav").insertAdjacentHTML(
    "beforeend",
    '<button class="nav-item" data-view="toolbox"><span>▦</span>Toolbox <em id="toolbox-count">—</em></button><button class="nav-item" data-view="terminal"><span>›_</span>Terminal</button>',
  );
  $("main").insertAdjacentHTML(
    "beforeend",
    `
    <section id="toolbox-view" class="view">
      <div class="module-heading"><div><p class="eyebrow">Commander Toolbox</p><h2>Your toolkit, one workspace.</h2><p>Find a tool, review its command, and follow its installer here.</p></div><button class="secondary-button" id="toolbox-refresh">Refresh catalog</button></div>
      <div class="toolbox-intro panel"><div><span class="eyebrow">Shared with your Toolbox</span><p id="toolbox-source">The desktop app loads the bundled catalog and checks this machine.</p></div><label>Run tools in<select id="toolbox-terminal"><option value="embedded">Command Center terminal</option><option value="external">My external terminal</option></select></label></div>
      <details class="panel toolbox-setup"><summary>Quick setup <span>Myfish, dotfiles & applications</span></summary><form id="toolbox-setup-form"><label>What are you setting up?<select id="toolbox-workflow"><option value="myfish">Myfish shell</option><option value="dotfiles">Dotfiles configuration</option><option value="apps">Application</option></select></label><label>Choose a setup<select id="toolbox-setup-choice"></select></label><button type="submit" class="secondary-button">Review setup</button></form><p class="settings-help">Choose one setup at a time. The original installer handles package choices, backups, and confirmations.</p></details>
      <div class="toolbox-filters"><input id="toolbox-search" type="search" aria-label="Search Toolbox" placeholder="Search names, descriptions, or groups…"><button class="secondary-button" id="toolbox-favorites" aria-pressed="false">★ Favorites</button><label><input type="checkbox" id="toolbox-available" checked> Available on this machine</label></div>
      <div id="toolbox-categories" class="toolbox-categories" aria-label="Toolbox categories"></div>
      <p id="toolbox-feedback" role="status" class="settings-help">Open Toolbox to load your tools.</p>
      <div class="toolbox-layout"><div id="toolbox-list" class="toolbox-list"></div><aside id="toolbox-detail" class="panel module-panel"><p class="module-empty">Select a tool to see its details.</p></aside></div>
    </section>
    <section id="terminal-view" class="view"><div class="module-heading"><div><p class="eyebrow">Interactive workspace</p><h2 id="terminal-title">Terminal</h2><p>Installers and menus, with their original prompts.</p></div><div class="button-row"><button class="secondary-button" data-feature-view="activity">Activity</button><button class="secondary-button" id="terminal-save">Save output</button><button class="secondary-button" id="terminal-stop" disabled>Stop workflow</button></div></div><p id="terminal-status" role="status" class="settings-help">Start a Toolbox action to open an interactive session.</p><div id="embedded-terminal" class="embedded-terminal" aria-label="Interactive Toolbox terminal"></div><p class="settings-help">Input is never recorded. Output is held in memory; use Save output only when you want a file. For image graphics, use your external terminal.</p></section>
  `,
  );
  const terminal = createTerminal(api);
  const actions = () => catalog?.actions || [];
  function choose(id) {
    selected = id;
    render();
  }
  function renderSetup() {
    $("#toolbox-setup-choice").innerHTML = setupTools(
      actions(),
      $("#toolbox-workflow").value,
    )
      .map(
        (tool) =>
          `<option value="${e(tool.id)}" ${tool.available ? "" : "disabled"}>${e(tool.name)}${tool.available ? "" : " (unavailable)"}</option>`,
      )
      .join("");
  }
  function render() {
    const list = filterTools(actions(), {
      query: $("#toolbox-search").value,
      category,
      favorites: favoritesOnly ? favorites : null,
      available: $("#toolbox-available").checked,
    });
    if (!list.some((a) => a.id === selected)) selected = list[0]?.id;
    const categories = [...new Set(actions().map((a) => a.category))];
    $("#toolbox-categories").innerHTML = ["", ...categories]
      .map(
        (name) =>
          `<button type="button" data-category="${e(name)}" aria-pressed="${category === name}">${e(name || "All tools")} <span>${actions().filter((a) => !name || a.category === name).length}</span></button>`,
      )
      .join("");
    $$("#toolbox-categories button").forEach((btn) =>
      btn.addEventListener("click", () => {
        category = btn.dataset.category;
        render();
      }),
    );
    $("#toolbox-feedback").textContent =
      `${list.length} of ${actions().length} tools${favoritesOnly ? " · favorites" : ""}`;
    $("#toolbox-list").innerHTML = list.length
      ? list
          .map(
            (tool) =>
              `<button type="button" class="toolbox-row ${tool.id === selected ? "selected" : ""}" data-tool="${e(tool.id)}" aria-pressed="${tool.id === selected}"><span class="toolbox-icon">${favorites.includes(tool.id) ? "★" : "⌘"}</span><span><small>${e(tool.groups.join(" / ") || tool.category)}</small><strong>${e(tool.name)}</strong><span>${e(tool.description)}</span></span><em>${tool.available ? "›" : "Unavailable"}</em></button>`,
          )
          .join("")
      : '<p class="module-empty">No tools match these filters. Try another search or turn off Available on this machine.</p>';
    $$("[data-tool]").forEach((btn) =>
      btn.addEventListener("click", () => choose(btn.dataset.tool)),
    );
    const tool = list.find((a) => a.id === selected);
    if (!tool) {
      $("#toolbox-detail").innerHTML =
        '<p class="module-empty">Select a tool to see its details.</p>';
      return;
    }
    const last = jobs.find(
      (j) => j.action === "toolbox" && j.toolId === tool.id,
    );
    $("#toolbox-detail").innerHTML =
      `<div class="panel-heading"><p class="eyebrow">${e(tool.category)}</p><button type="button" id="toolbox-favorite" class="favorite-button" aria-label="Favorite ${e(tool.name)}" aria-pressed="${favorites.includes(tool.id)}">★</button></div><h2>${e(tool.name)}</h2><p class="toolbox-description">${e(tool.description || "Run this workflow using its original Toolbox script.")}</p><p class="settings-help">${e(tool.groups.join(" / "))}</p><p class="settings-help">${e(taskLabels(tool.taskList))}</p><p class="settings-help">${e(toolboxHint(tool))}</p><div class="status-strip">${tool.available ? "Ready for this machine" : "Unavailable: Toolbox preconditions or the required interpreter are not met."}${!tool.multiSelect ? "<br>Individual setup · run on its own" : ""}</div>${last ? `<p class="settings-help">Last run: ${e(last.status)} · ${e(new Date(last.startedAt).toLocaleString())}</p>` : ""}<button type="button" id="toolbox-run" class="primary-button" ${tool.available ? "" : "disabled"}>Review & run</button><p class="settings-help">You will see the exact command before starting. Prompts stay with the original installer.</p>`;
    $("#toolbox-favorite").addEventListener(
      "click",
      guard(() => {
        favorites = favorites.includes(tool.id)
          ? favorites.filter((id) => id !== tool.id)
          : [...favorites, tool.id];
        localStorage.setItem(
          "command-center.toolbox-favorites",
          JSON.stringify(favorites),
        );
        render();
      }),
    );
    $("#toolbox-run").addEventListener(
      "click",
      guard(() =>
        action({
          action: "toolbox",
          toolId: tool.id,
          terminalMode: $("#toolbox-terminal").value,
        }),
      ),
    );
  }
  async function load() {
    if (loading) return;
    loading = true;
    $("#toolbox-refresh").disabled = true;
    $("#toolbox-feedback").textContent =
      "Loading catalog and checking compatibility…";
    try {
      if (!state.desktop) {
        $("#toolbox-feedback").textContent =
          "Open the installed desktop app to load all 215 tools and check your machine. Browser preview cannot run installers.";
        return;
      }
      const result = await run("toolbox_catalog");
      if (!Array.isArray(result?.actions))
        throw new Error("Toolbox returned an invalid catalog");
      catalog = result;
      $("#toolbox-count").textContent = String(actions().length);
      $("#toolbox-source").textContent =
        `${actions().length} tools · ${actions().filter((a) => a.available).length} available · bundled revision ${catalog.revision.slice(0, 7)}`;
      renderSetup();
      render();
    } catch (error) {
      $("#toolbox-feedback").textContent =
        `Could not refresh Toolbox: ${error}. Try Refresh catalog.`;
    } finally {
      loading = false;
      $("#toolbox-refresh").disabled = false;
    }
  }
  $("#toolbox-refresh").addEventListener("click", () => void load());
  $("#toolbox-search").addEventListener("input", render);
  $("#toolbox-available").addEventListener("change", render);
  $("#toolbox-favorites").addEventListener("click", () => {
    favoritesOnly = !favoritesOnly;
    $("#toolbox-favorites").setAttribute("aria-pressed", favoritesOnly);
    render();
  });
  $("#toolbox-workflow").addEventListener("change", renderSetup);
  $("#toolbox-setup-form").addEventListener("submit", (event) => {
    event.preventDefault();
    category = "";
    favoritesOnly = false;
    $("#toolbox-favorites").setAttribute("aria-pressed", "false");
    $("#toolbox-search").value = "";
    choose($("#toolbox-setup-choice").value);
    $("#toolbox-detail").scrollIntoView({
      block: "nearest",
      behavior: "smooth",
    });
  });
  return {
    onView(view) {
      if (view === "toolbox" && !catalog) void load();
      terminal.onView(view);
    },
    started(id, plan) {
      terminal.open(id, plan.title);
    },
    openTerminal(job) {
      terminal.open(job.id, job.title);
    },
    updateJobs(next) {
      jobs = next;
    },
  };
}
