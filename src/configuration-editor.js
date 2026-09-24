import {
  ghosttyFields,
  ghosttyValues,
  updateGhostty,
  parseFastfetch,
  editFastfetch,
  moduleType,
} from "./config-controls.js";
import { createConfigHistory } from "./config-history.js";
import { button } from "./ui.js";

// Ghostty and Fastfetch source editing: visual controls, preview, validation and saving.
export function createConfigurationEditor({
  state,
  $,
  $$,
  escapeHtml: e,
  toast,
  run,
  guard,
  review,
}) {
  let configDocument = null,
    configKind = "ghostty",
    configVersion = 0;
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
  const configHistory = createConfigHistory({
    $,
    run,
    review,
    getDocument: () => configDocument,
    getKind: () => configKind,
    setDraft(content) {
      $("#config-text").value = content;
      $("#config-state").textContent = "Unsaved restored draft";
      renderConfigControls();
    },
  });
  return {
    onView(view) {
      if (view === "config" && !configDocument) void loadConfig();
    },
  };
}
