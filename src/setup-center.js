import { normalizeIntegrations } from "./preferences.js";
export function bundleSummary(bundle) {
  return `${bundle.repositories.length} repositories · ${Object.keys(bundle.workspace).length} workspace profiles · ${bundle.operations.workflows.length} workflows · ${bundle.operations.profiles.length} machine profiles · ${bundle.operations.tools.length} personal tools · ${bundle.toolboxFavorites.length} Toolbox favorites`;
}
export function keptSummary(kept = []) {
  return kept.length
    ? `Already on this machine and kept unchanged (${kept.length}): ${kept.join(", ")}`
    : "";
}
export function recoveryMessage(recovery) {
  return recovery.error
    ? `An interrupted setup import could not be rolled back automatically: ${recovery.error}`
    : `An interrupted setup import was rolled back and your previous setup restored. Its backup remains at ${recovery.restored}. Import the bundle again when ready.`;
}
export function mergeDetected(current, detected) {
  return normalizeIntegrations({
    ...current,
    ...Object.fromEntries(
      Object.entries(detected || {}).filter(
        ([key, value]) => !current[key] && value !== "",
      ),
    ),
  });
}
export function createSetupCenter({
  state,
  invoke,
  escapeHtml: e,
  toast,
  switchView,
  acceptSettings,
}) {
  const $ = (s) => document.querySelector(s);
  const fields = [
    ["dotfilesPath", "Commander-os / dotfiles repository"],
    ["flakeProfile", "Home Manager profile"],
    ["backupScript", "Personal backup helper"],
    ["fullBackupScript", "Full backup helper"],
    ["backupHealthScript", "Backup health helper"],
    ["resticRepository", "Restic repository"],
  ];
  let environment = {},
    draft,
    step = 0,
    profiles = [],
    checks = [],
    checked = false,
    text = "",
    exporting = false,
    preview = null,
    previewHome = "",
    previewMode = "merge",
    previewVersion = 0,
    draftVersion = 0,
    busy = false,
    applying = false;
  $("#dashboard-view").insertAdjacentHTML(
    "afterbegin",
    `<section id="setup-welcome" class="panel module-panel" hidden><h3>Make this machine yours</h3><p>Connect your existing setup or import a portable setup bundle.</p><button type="button" class="primary-button" id="welcome-setup">Open setup wizard</button></section>`,
  );
  $(".settings-transfer").insertAdjacentHTML(
    "afterend",
    `<section class="panel module-panel"><div class="panel-heading"><div><h3>Setup & portability</h3><p>Move your saved setup between machines.</p></div><button type="button" id="setup-open" class="secondary-button">Setup wizard</button></div><div class="button-row"><button type="button" id="bundle-export" class="secondary-button">Export setup bundle…</button><button type="button" id="bundle-import" class="secondary-button">Import setup bundle…</button><input type="file" id="bundle-file" accept=".json,application/json" hidden></div><p id="bundle-status" role="status"></p></section>`,
  );
  document.body.insertAdjacentHTML(
    "beforeend",
    `<dialog id="setup-dialog" class="wide-dialog" aria-labelledby="setup-title"><div class="dialog-card"><div class="dialog-heading"><h2 id="setup-title">Set up this machine</h2><button type="button" id="setup-close" class="secondary-button">Close</button></div><p id="setup-machine"></p><p id="setup-progress" role="status"></p><form id="setup-form"><section data-setup-step="0"><h3 tabindex="-1">1. Your workspace</h3><label>Display name<input id="setup-name" required maxlength="40"></label><label>Repository scan folders — one per line<textarea id="setup-roots" rows="4" required></textarea></label><p>Use absolute or ~/ paths. Imported repositories are discovered here once their folders exist.</p><button type="button" id="setup-import-link" class="secondary-button">Import an existing setup…</button></section><section data-setup-step="1" hidden><h3 tabindex="-1">2. Connect existing tools</h3><p>Detection fills empty fields. Review these values before saving.</p><button type="button" id="setup-detect" class="secondary-button">Detect existing setup</button>${fields.map(([key, label]) => `<label>${label}<input id="setup-${key}" autocomplete="off" maxlength="4096"></label>`).join("")}<p>Credential files and wallet entries stay configured in Settings → System integrations.</p></section><section data-setup-step="2" hidden><h3 tabindex="-1">3. Check this machine</h3><button type="button" id="setup-check" class="secondary-button">Check prerequisites</button><div id="setup-checks"></div><p>Missing tools can be installed through Toolbox. Paths and credentials can be adjusted in Settings. Nothing is installed here.</p><div class="button-row"><button type="button" id="setup-toolbox" class="secondary-button">Open Toolbox</button><button type="button" id="setup-settings" class="secondary-button">Open Settings</button></div><label>Saved machine profile<select id="setup-profile"><option value="">No profile selected</option></select></label><button type="button" id="setup-assess" class="secondary-button">Inspect profile</button><div id="setup-assessment"></div></section><section data-setup-step="3" hidden><h3 tabindex="-1">4. Review & save</h3><p>Save these connections. Run installers and profile steps separately in Workflows after reviewing each command.</p><pre id="setup-review" class="output" tabindex="0" aria-label="Setup settings to save"></pre></section><p id="setup-status" role="status"></p><div class="dialog-actions"><button type="button" id="setup-back" class="secondary-button">Back</button><button type="button" id="setup-next" class="primary-button">Next</button><button type="submit" id="setup-save" class="primary-button" hidden>Save setup</button></div></form></div></dialog>
  <dialog id="bundle-dialog" class="wide-dialog" aria-labelledby="bundle-title"><div class="dialog-card"><h2 id="bundle-title">Review setup bundle</h2><p id="bundle-description"></p><label id="bundle-home-label">Home folder on this machine<input id="bundle-home" maxlength="4096"></label><fieldset id="bundle-mode"><legend>Import method</legend><label class="check-row"><input type="radio" name="bundle-mode" value="merge" checked>Merge: keep everything on this machine and add new items</label><label class="check-row"><input type="radio" name="bundle-mode" value="replace">Replace: use the bundle’s saved setup instead of this machine’s</label></fieldset><button type="button" id="bundle-preview" class="secondary-button">Update preview</button><p id="bundle-summary"></p><p id="bundle-kept"></p><p>Credential files, wallet entries, activity logs, and file contents are excluded. Saved commands are included: inspect them for private values before sharing. Paths inside command text and input values are not rewritten.</p><pre id="bundle-content" class="output bundle-content" tabindex="0" aria-label="Full setup bundle preview"></pre><p id="bundle-error" role="alert"></p><label id="bundle-consent-label" class="check-row"><input type="checkbox" id="bundle-consent"><span id="bundle-consent-text"></span></label><div class="dialog-actions"><button type="button" id="bundle-cancel" class="secondary-button">Cancel</button><button type="button" id="bundle-apply" class="primary-button" disabled>Import setup</button></div></div></dialog>`,
  );
  const fail = (where, err) => {
    $(where).textContent = String(err.message || err);
  };
  const safe =
    (fn, where = "#setup-status") =>
    async (event) => {
      event?.preventDefault();
      if (busy) return;
      busy = true;
      try {
        await fn(event);
      } catch (err) {
        fail(where, err);
      } finally {
        busy = false;
      }
    };
  function desktop() {
    if (!invoke)
      throw Error(
        "Setup transfer and machine detection require the desktop app.",
      );
    if (state.settingsLoadFailed)
      throw Error("Resolve the settings load error before changing setup.");
  }
  function cleanDraft() {
    if (state.preferencesDirty)
      throw Error("Save or discard the current Settings draft first.");
  }
  function capture() {
    draft.displayName = $("#setup-name").value.trim();
    draft.roots = [
      ...new Set(
        $("#setup-roots")
          .value.split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    ];
    if (
      !draft.displayName ||
      draft.roots.length > 32 ||
      draft.roots.some((r) => !/^(~$|~\/|\/)/.test(r) || /[\0\r\n]/.test(r))
    )
      throw Error(
        "Enter a name and up to 32 absolute or ~/ repository folders.",
      );
    for (const [key] of fields)
      draft.integrations[key] = $("#setup-" + key).value.trim();
  }
  function fill() {
    $("#setup-name").value = draft.displayName;
    $("#setup-roots").value = draft.roots.join("\n");
    for (const [key] of fields)
      $("#setup-" + key).value = draft.integrations[key];
  }
  function renderStep(focus = true) {
    document.querySelectorAll("[data-setup-step]").forEach((el) => {
      el.hidden = Number(el.dataset.setupStep) !== step;
    });
    $("#setup-progress").textContent = `Step ${step + 1} of 4`;
    $("#setup-back").disabled = step === 0;
    $("#setup-next").hidden = step === 3;
    $("#setup-save").hidden = step !== 3;
    if (step === 3)
      $("#setup-review").textContent = JSON.stringify(
        {
          displayName: draft.displayName,
          roots: draft.roots,
          integrations: draft.integrations,
          prerequisites: checked ? checks : "Not checked",
          profile: $("#setup-profile").selectedOptions[0]?.textContent,
        },
        null,
        2,
      );
    if (focus) $(`[data-setup-step="${step}"] h3`).focus();
  }
  async function openWizard() {
    desktop();
    cleanDraft();
    draft = structuredClone(state.settings);
    step = 0;
    checks = [];
    checked = false;
    fill();
    $("#setup-status").textContent = "";
    $("#setup-checks").replaceChildren();
    $("#setup-assessment").replaceChildren();
    if (!environment.home) environment = await invoke("setup_environment");
    const collection = await invoke("load_operations");
    profiles = collection?.profiles || [];
    $("#setup-profile").innerHTML =
      '<option value="">No profile selected</option>' +
      profiles
        .map((p) => `<option value="${e(p.id)}">${e(p.name)}</option>`)
        .join("");
    $("#setup-machine").textContent =
      `${environment.distribution || "Linux"} · ${environment.home || ""}`;
    renderStep(false);
    $("#setup-dialog").showModal();
    $("#setup-name").focus();
  }
  for (const id of ["setup-open", "welcome-setup"])
    $("#" + id).addEventListener("click", safe(openWizard, "#bundle-status"));
  $("#setup-close").addEventListener("click", () => $("#setup-dialog").close());
  $("#setup-back").addEventListener(
    "click",
    safe(() => {
      capture();
      step--;
      renderStep();
    }),
  );
  $("#setup-next").addEventListener(
    "click",
    safe(() => {
      capture();
      step++;
      renderStep();
    }),
  );
  $("#setup-form").addEventListener("input", () => {
    draftVersion++;
    checked = false;
    $("#setup-checks").replaceChildren();
    $("#setup-assessment").replaceChildren();
  });
  $("#setup-detect").addEventListener(
    "click",
    safe(async () => {
      capture();
      const version = draftVersion;
      const detected = await invoke("detect_integrations");
      if (version !== draftVersion) return;
      draft.integrations = mergeDetected(draft.integrations, detected);
      fill();
      $("#setup-status").textContent =
        "Detected values added to this draft. Review paths, then check prerequisites.";
    }),
  );
  $("#setup-check").addEventListener(
    "click",
    safe(async () => {
      capture();
      const version = draftVersion;
      $("#setup-status").textContent = "Checking draft paths and tools…";
      const results = await invoke("check_integrations", {
        integrations: draft.integrations,
      });
      if (version !== draftVersion) return;
      checks = results;
      checked = true;
      $("#setup-checks").innerHTML = checks
        .map(
          (c) =>
            `<p><strong>${e(c.label)}</strong> · ${e(c.status)}<br>${e(c.message)}</p>`,
        )
        .join("");
      $("#setup-status").textContent =
        "Local checks complete. Remote connections and credentials were not tested.";
    }),
  );
  $("#setup-assess").addEventListener(
    "click",
    safe(async () => {
      const id = $("#setup-profile").value;
      if (!id) throw Error("Select a saved machine profile first.");
      capture();
      const version = draftVersion;
      const rows = await invoke("assess_setup_profile", {
        id,
        settings: draft,
      });
      if (version !== draftVersion) return;
      $("#setup-assessment").innerHTML = rows
        .map(
          (r) =>
            `<p><strong>${e(r.name)}</strong> · ${e(r.status)}<br>${e(r.detail)}</p>`,
        )
        .join("");
      $("#setup-status").textContent =
        "Profile inspected using this draft. Run its reviewed steps in Workflows after saving.";
    }),
  );
  for (const view of ["toolbox", "settings"])
    $("#setup-" + view).addEventListener("click", () => {
      $("#setup-dialog").close();
      switchView(view);
    });
  $("#setup-form").addEventListener(
    "submit",
    safe(async () => {
      if (step !== 3) {
        capture();
        step++;
        renderStep();
        return;
      }
      capture();
      cleanDraft();
      const saved = { ...draft, setupCompleted: true };
      await invoke("save_settings", { settings: saved });
      await acceptSettings(saved);
      $("#setup-welcome").hidden = true;
      $("#setup-dialog").close();
      toast("Setup saved. Review profile steps in Workflows when ready.");
      if ($("#setup-profile").value) switchView("operations");
    }),
  );
  function consent() {
    $("#bundle-apply").disabled =
      !preview || (!exporting && !$("#bundle-consent").checked);
  }
  function invalidate() {
    previewVersion++;
    preview = null;
    $("#bundle-content").textContent = "";
    $("#bundle-kept").textContent = "";
    $("#bundle-summary").textContent =
      "Update the preview after changing the home folder or import method.";
    $("#bundle-consent").checked = false;
    consent();
  }
  async function updatePreview() {
    invalidate();
    $("#bundle-error").textContent = "";
    const version = previewVersion;
    const home = $("#bundle-home").value.trim();
    const mode = importMode();
    const result = await invoke("preview_setup_bundle", {
      text,
      targetHome: home,
      mode,
    });
    if (version !== previewVersion) return;
    preview = result.bundle;
    previewHome = home;
    previewMode = mode;
    $("#bundle-summary").textContent = bundleSummary(preview);
    $("#bundle-kept").textContent = keptSummary(result.kept);
    $("#bundle-content").textContent = JSON.stringify(preview, null, 2);
    consent();
  }
  function importMode() {
    return $('input[name="bundle-mode"]:checked')?.value || "merge";
  }
  function describeMode() {
    const merge = importMode() === "merge";
    $("#bundle-consent-text").textContent = merge
      ? "Add this preview’s new items to this machine’s saved setup."
      : "Replace this machine’s saved settings, workflows, personal tools, workspace profiles, and Toolbox favorites with this preview.";
  }
  function showBundle(isExport) {
    exporting = isExport;
    $("#bundle-title").textContent = isExport
      ? "Review setup export"
      : "Review setup import";
    $("#bundle-description").textContent = isExport
      ? "Exports saved definitions. Unsaved drafts are not included."
      : "Merge keeps this machine’s preferences and definitions and adds new ones; Replace swaps in the bundle’s saved definitions. A backup is kept, and the app reloads after import. Missing repositories are remembered for scanning; their files are not cloned. The automatic backup health helper stays configured for this machine; set it separately in Settings.";
    $("#bundle-home-label").hidden = isExport;
    $("#bundle-mode").hidden = isExport;
    $("#bundle-kept").textContent = "";
    describeMode();
    $("#bundle-preview").hidden = isExport;
    $("#bundle-consent-label").hidden = isExport;
    $("#bundle-apply").textContent = isExport
      ? "Export bundle"
      : "Import setup & reload";
    $("#bundle-error").textContent = "";
    $("#bundle-consent").checked = false;
    consent();
    $("#bundle-dialog").showModal();
  }
  $("#bundle-export").addEventListener(
    "click",
    safe(async () => {
      desktop();
      const favorites = JSON.parse(
        localStorage.getItem("command-center.toolbox-favorites") || "[]",
      );
      preview = await invoke("create_setup_bundle", {
        repositories: state.repositories.map((r) => r.path),
        toolboxFavorites: favorites,
      });
      showBundle(true);
      $("#bundle-summary").textContent = bundleSummary(preview);
      $("#bundle-content").textContent = JSON.stringify(preview, null, 2);
    }, "#bundle-status"),
  );
  const pick = safe(() => {
    desktop();
    cleanDraft();
    $("#bundle-file").click();
  }, "#bundle-status");
  $("#bundle-import").addEventListener("click", pick);
  $("#setup-import-link").addEventListener("click", () => {
    $("#setup-dialog").close();
    void pick();
  });
  $("#bundle-file").addEventListener(
    "change",
    safe(async (event) => {
      try {
        const file = event.target.files?.[0];
        if (!file) return;
        if (file.size > 2_000_000) {
          $("#bundle-status").textContent = "Bundle exceeds 2 MB.";
          throw Error("Bundle exceeds 2 MB.");
        }
        text = await file.text();
        if (!environment.home) environment = await invoke("setup_environment");
        $("#bundle-home").value = environment.home;
        preview = null;
        showBundle(false);
        await updatePreview();
      } finally {
        event.target.value = "";
      }
    }, "#bundle-error"),
  );
  $("#bundle-home").addEventListener("input", invalidate);
  for (const radio of document.querySelectorAll('input[name="bundle-mode"]'))
    radio.addEventListener("change", () => {
      describeMode();
      void safe(updatePreview, "#bundle-error")();
    });
  $("#bundle-preview").addEventListener(
    "click",
    safe(updatePreview, "#bundle-error"),
  );
  $("#bundle-consent").addEventListener("change", consent);
  $("#bundle-cancel").addEventListener("click", () => {
    if (applying) return;
    invalidate();
    $("#bundle-dialog").close();
  });
  $("#bundle-dialog").addEventListener("cancel", (event) => {
    if (applying) event.preventDefault();
    else invalidate();
  });
  $("#bundle-apply").addEventListener(
    "click",
    safe(async () => {
      if (!preview) return;
      applying = true;
      $("#bundle-cancel").disabled = true;
      $("#bundle-home").disabled = true;
      $("#bundle-apply").disabled = true;
      try {
        if (exporting) {
          const path = await invoke("export_setup_bundle", { bundle: preview });
          $("#bundle-status").textContent = `Exported setup to ${path}`;
          $("#bundle-dialog").close();
          return;
        }
        if (!$("#bundle-consent").checked) return;
        cleanDraft();
        const result = await invoke("import_setup_bundle", {
          text,
          targetHome: previewHome,
          expected: preview,
          mode: previewMode,
        });
        localStorage.removeItem("command-center-workflow-run");
        localStorage.setItem("command-center.setup-import-token", result.token);
        $("#bundle-status").textContent =
          `Imported. Previous setup: ${result.backup}`;
        window.location.reload();
      } finally {
        applying = false;
        $("#bundle-cancel").disabled = false;
        $("#bundle-home").disabled = false;
        consent();
      }
    }, "#bundle-error"),
  );
  return {
    async beforeInitialize() {
      if (!invoke) return;
      try {
        const saved = await invoke("setup_import_state");
        if (
          saved?.token &&
          saved.token !==
            localStorage.getItem("command-center.setup-import-token")
        ) {
          localStorage.removeItem("command-center-workflow-run");
          localStorage.setItem(
            "command-center.setup-import-token",
            saved.token,
          );
          // Reload to refresh collections already mounted from webview storage.
          window.location.reload();
        }
        if (saved?.backup)
          $("#bundle-status").textContent =
            `Previous setup backup: ${saved.backup}`;
        if (saved?.recovery) {
          const message = recoveryMessage(saved.recovery);
          $("#bundle-status").textContent = message;
          toast(message, true);
        }
      } catch (error) {
        fail("#bundle-status", error);
      }
    },
    initialized() {
      $("#setup-welcome").hidden =
        state.settings.setupCompleted || !state.desktop;
      if (state.firstRun && state.desktop)
        void safe(openWizard, "#bundle-status")();
    },
  };
}
