# Setup bundles, onboarding, and project workspaces

These features are available in **Command Center 0.5.0** and later. Merge imports and automatic recovery of interrupted imports require **0.6.0**.

## Move a setup between machines

Open **Settings → Setup & portability → Export setup bundle**. Review the full JSON before exporting it to Downloads. The bundle contains saved settings, scan roots and discovered repository paths, repository favorites/groups/launch profiles/tasks/services, maintenance workflows, machine profiles, personal tools, notification preferences, and Toolbox favorites. Unsaved form drafts are not included.

It does not copy repository contents, backups, credential files, activity logs, recovery baselines, or configuration-file contents. Password-file paths and wallet identifiers are removed, along with remote Restic addresses that might contain credentials. Saved commands and workflow input values are included verbatim: inspect them for private values before sharing the file.

On the destination, choose **Import setup bundle**, then set the destination home folder. The preview rewrites the source home prefix and `~/` in structured paths, including scan roots, working directories, integration paths, workflow paths, and workspace keys. It leaves other absolute paths, URLs, command text, and arbitrary input values unchanged. Review those values for machine-specific references. Missing repositories are remembered for discovery but are not cloned; use a reviewed machine-profile clone step if needed.

Choose an import method:

- **Merge** (default) keeps this machine's preferences and every saved definition. It adds workflows, machine profiles, personal tools, quick actions, and workspace profiles whose IDs (or repository paths) are new here, adds new scan folders and Toolbox favorites, and fills integration paths that are empty on this machine. When the bundle has a different item with an ID that already exists here, the local item is kept and listed under **Already on this machine and kept unchanged**. Identical items are not listed. A merge that would exceed a collection limit (for example, 30 workflows) is rejected.
- **Replace** swaps this machine's saved settings, workflows, machine profiles, personal tools, workspace profiles, and Toolbox favorites for the bundle's.

The preview shows the exact result that will be saved. A confirmation checkbox is required. Editing the home folder or changing the method refreshes the preview and clears the checkbox. The backend validates the bundle again when applying it and rejects the import if this machine's saved setup changed after the preview. Unknown bundle versions, invalid definitions, path collisions, and files over 2 MB are rejected. Current local password-file/wallet connections are retained. A local Restic path in the bundle replaces the current repository path; an omitted remote connection keeps the current connection.

No imported command runs automatically. Both setup bundles and preference imports retain this machine’s existing backup health helper, including an empty value. Configure that automatic helper separately in Settings after reviewing its executable. The app reloads after importing, clears old workflow progress, and offers setup review on the dashboard. A running job blocks import.

Before replacing files, the app saves the previous bytes to a private `setup-backups/before-import-<timestamp>.json` file under its local app-data directory, then records that backup in `setup-import-journal.json`. Settings shows the backup path after reload. Ordinary write failures roll back completed replacements immediately.

If the app, session, or computer stops during an import, the journal remains. On the next launch, before the interface opens, Command Center restores every file from the recorded backup and removes the journal. The dashboard then reports that the interrupted import was rolled back; import the bundle again when ready. Recovery restores only the files an import writes (settings, workflows and profiles, workspace profiles, Toolbox favorites, and import state) and refuses a backup that names any other file.

If automatic recovery cannot complete, the journal is kept and the dashboard shows the reason on each launch. To recover manually, close the app, inspect the backup (pairs of original absolute paths and byte arrays; `null` means the file did not exist), restore the recorded bytes to those files, then delete `setup-import-journal.json`. Retain these private backups locally.

The older **Export saved settings** option remains available for preference-only transfers. Setup bundles use a separate, versioned format.

## First-run setup wizard

The wizard opens on a new desktop installation and can be reopened from Settings. Existing installations receive a dashboard setup prompt until setup is saved.

1. Choose your display name and repository scan folders.
2. Detect existing Commander-os/dotfiles, Home Manager, and backup helper connections. Detection fills empty fields in a draft; it does not overwrite configured values or save automatically.
3. Check local paths and executable prerequisites. Missing tools can be installed through Toolbox; connections and credential references can be adjusted in Settings. Checks do not prove remote access or backup credentials work. Select an existing machine profile to inspect its steps against the draft connections and its saved overrides.
4. Review and save. If a profile was selected, Workflows opens so you can review each step separately. Saving does not activate Home Manager or run installers.

Close the wizard to discard its draft. Save or discard any existing Settings draft before opening the wizard or importing a bundle.

## Project workspaces

Choose **Repositories → Workspace** on a repository card. The workspace adds:

- **Open workspace:** uses the saved editor, terminal, and documentation launch selections. The organization/launch form remains below Git details.
- **Detect project tasks:** reads `package.json` for build/test/dev/lint/check/start scripts and detects Cargo build/test/check/run tasks from `Cargo.toml`. Detection never executes scripts. Add suggestions individually; npm tasks use `npm run`, including any configured pre/post hooks when eventually executed. Other package managers and nested packages can use custom tasks.
- **Custom tasks:** a name, command, shell (direct arguments, Fish, or Bash), and embedded/background/external terminal mode. Tasks always run from this repository's root. Every run uses command review, rechecks the saved definition, and appears in Activity. Long-running development servers can be stopped there. The existing one-running-job limit applies.
- **Related services:** link a named user/system service or timer and inspect its properties and recent journal output. Linking/inspection does not start, stop, enable, or disable it. Use Services for reviewed controls.

Saving the organization/launch form preserves task and service definitions, and saving tasks preserves the launch profile. Older workspace files migrate with empty task/service lists.

## Keyboard navigation

Tab reaches a **Skip to main content** link. Up/Down and Home/End move focus between primary navigation buttons; Enter or Space opens the focused page. Page changes focus the main heading, and navigation exposes the active page to assistive technology. Dialogs retain native Escape/focus behavior. Inputs, controls, and scrollable previews have visible keyboard focus. OS reduced-motion preferences are respected.
