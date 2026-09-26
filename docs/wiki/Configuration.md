# 🎛️ Configuration

> _Ghostty and Fastfetch editors with preview, validation and history._

**Configuration** edits your **Ghostty** terminal and **Fastfetch** settings with visual controls, a live preview, validation and a full history. Pick the app from the **Application** dropdown.

The editor always works on your editable **source** file (set in **Settings → System integrations**). It never edits generated files in `/nix/store`. If Home Manager owns the live file, the page says so. Save your edits here, then use [System Sync](System-Sync) → **Apply Home Manager** to activate them.

## Editing

You can edit in two ways, and they stay in sync:

- **Controls:** form fields for common settings.
  - *Ghostty:* font family and size, theme, window padding, background opacity, cursor style. Click **Apply controls to draft**.
  - *Fastfetch:* logo source and type and the separator (**Apply logo & separator**), plus the **module** list: move modules up or down, remove them, or **Add module**.
- **Source configuration:** the raw file in a text editor, for anything the controls don't cover.

Changes stay in a **draft** until you save. **Preview** shows roughly how the result will look: font, padding and opacity for Ghostty, the module list for Fastfetch. It's an illustration, not a real terminal. Fastfetch `command` modules are never run in the preview.

## Saving

1. **Validate** checks the draft. Ghostty uses its own `ghostty +validate-config`; Fastfetch checks the JSONC syntax and module structure.
2. **Review & save** shows the current and new content side by side.
3. On confirm, the app saves a backup of the current file, then writes the new one in a single step.

> [!NOTE]
> If the file changed on disk after you loaded it (say, you edited it in another editor), saving stops and asks you to reload rather than overwrite that change. **Reload file** discards your draft and loads the file from disk again.

Your edits keep everything else in the file: Ghostty keeps unrelated lines, and Fastfetch keeps comments and custom module options.

## Configuration history

**Configuration history** lists the last 100 saved versions for the selected app.

- Select a version and click **Compare** to see it next to your current draft.
- **Review restore to draft** loads that version into the editor as a draft. Nothing is written until you **Review & save**.

Every save also appears in the [Change timeline](Activity-and-Change-Timeline).

---

| | |
|:--|--:|
| [← 🔄 System Sync](System-Sync) | [🩺 Health, Services & Inventory →](Health-Services-and-Inventory) |
