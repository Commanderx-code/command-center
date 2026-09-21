# User guide

[← Command Center](../README.md) · [Installation](installation.md) · [Development](development.md)

## Features

- **Toolbox:** all 215 bundled actions across Applications Setup, Gaming, Security, System Setup, and Utilities. Browse the same folders and nested submenus as the TUI, navigate with breadcrumbs or Up, search within a folder and its descendants, filter by availability, keep favorites, and choose Myfish, dotfiles, or application setups through graphical selectors. Run one reviewed action at a time in the embedded terminal or your preferred external terminal.
- **Interactive terminal:** real PTY input, password prompts, ANSI menus, resizing, cancellation, and exit status. Terminal output stays in a bounded 1 MB memory buffer and is never written to Activity. Save output explicitly if you need a private local transcript. The embedded terminal supports text/ANSI; use an external terminal for image graphics.

- **Repositories:** scan configurable roots, inspect branches and local changes, search/filter/sort, favorites, groups, changed-file lists, recent commits, and editor/terminal/remote launchers. Fetch updates remote-tracking information; pull requires a clean tracked branch and uses fast-forward only; push targets that branch's upstream without force or automatic tags.
- **Launch profiles:** save a documentation URL and choose whether a project opens its editor, terminal, and documentation together.
- **Activity:** preview each command before starting, stream output, stop background jobs, and inspect the last 100 results across app restarts. Only one operation runs at a time. Background output is capped at 2 MB per job, and truncation is explicit. Failed jobs can be marked reviewed.
- **System Sync:** inspect dotfiles changes, compare Ghostty/Fastfetch sources with their live files, view Home Manager generations, fetch/pull the config repository, build, and apply Home Manager.
- **Backup & Restore:** run your personal backup helper, run the full recovery helper in a terminal for encryption prompts, load recent Restic snapshots, browse directories, check repository metadata, and restore a snapshot or selected path/pattern into a new folder beneath your home directory.
- **Configuration:** Ghostty font, theme, padding, opacity, and cursor controls; Fastfetch logo/separator controls and module add/remove/reordering. Both include a source editor and illustrative preview. Ghostty uses its installed validator. Fastfetch validates JSONC syntax and module structure; it does not execute command modules or claim full runtime/schema validation.
- **System Health:** filesystem usage, failed user/system services, battery information, cached Arch package updates, installed tools, and locally recorded backup freshness.
- **Needs attention:** changed/unpushed/behind repositories, unreviewed failed jobs, overdue or unavailable backup records, disks at least 90% full, and failed services.
- **Recovery readiness:** check for the dotfiles checkout, Home Manager flake, backup drive, encrypted recovery files, and recovery instructions. Presence checks do not verify decryption or bootable recovery.
- **Preferences:** persistent appearance and application settings, card/list layouts, scan limits, refresh intervals, and editable integration paths.

## Connect your setup

On the first desktop launch without a configured dotfiles integration, Command Center detects your existing `~/.config/dotfiles/machine.json`, installed backup helpers, and Ghostty/Fastfetch source paths. Existing preferences are retained. Review **Settings → System integrations**; **Detect existing setup** can populate a new draft later.

- **Dotfiles repository** points to the checkout. The Home Manager flake may be in its `home-manager/` directory or repository root. **Home Manager profile** is the flake output name, such as `commander`.
- **Backup helpers** are executable paths to your existing `backup-personal`, `backup-everything`, and `backup-health` helpers. The health helper must return the dotfiles backup-health JSON format. These scripts continue using their own machine configuration.
- **Restic repository and credentials** control snapshot browsing, checks, and restores. Use an existing KWallet entry, password file, or inherited Restic credential environment. Password contents are never stored in preferences. A locked wallet can prompt through KWallet.
- **Configuration sources** must be editable files inside your home. Files resolving into `/nix/store` are never modified. For the existing dotfiles layout, a Home Manager-managed Fastfetch config maps to `configs/fastfetch/config.jsonc`. Other layouts can be set manually. Save the source, then build/apply Home Manager to activate it.
- **Recovery instructions** can point to a dedicated recovery document. Detection falls back to the dotfiles README if no recovery-specific file is found; review that choice.

## Toolbox integration

The desktop links directly to `linutil_core` from Commander Toolbox at commit `6a7edbf834ee60c88bd24f7c6cab853329c8f38e`. Its embedded script tree, relative imports, interpreter selection, and preconditions remain shared with the TUI. A worker owns the extracted tree for the lifetime of the app. Compatibility is checked again during review and immediately before execution. There is no runtime download of the catalog; individual scripts can download their normal dependencies.

Open a category folder, then its subfolders to reach a tool. Category buttons are shortcuts to the top-level folders. Search and favorites show matching tools within the current folder; use **All tools** to search the entire catalog. **Open containing folder** takes a search result back to its menu.

Use **Toolbox → Quick setup** to select a Myfish shell, dotfiles configuration, or application, then **Review & run**. Installer-specific choices and confirmations remain in the original script. **Run tools in** selects the embedded terminal or the external terminal configured in Settings. Return to a session from **Terminal** or its Activity entry. Only the latest session buffer remains available; it is lost on app exit. External terminal output stays external.

Future catalog updates require updating the pinned revision in `src-tauri/Cargo.toml` and `src-tauri/src/toolbox.rs`, refreshing Cargo.lock, running the [development checks](development.md#checks), and rebuilding. No sibling checkout is needed to build or run Command Center. Toolbox favorites are stored in the webview’s local storage. Activity records the action ID and bundled revision, but no terminal input or transcript.

## Operational behavior

Every operation displays its exact command and working directory for review. Repository Git credentials use existing helpers; SSH uses batch mode so unavailable authentication fails visibly instead of waiting for an invisible terminal prompt.

Background jobs show output and a recorded exit status. Full recovery backups use a terminal and write a completion receipt back to the app; terminal input/output is not captured. If the terminal closes without a receipt, use **Terminal closed? Stop monitoring** only after checking that the workflow has stopped. Closing the app normally is blocked while a job is running. After a crash, previously running jobs are marked interrupted; inspect the command before retrying.

Restore destinations must be nonexistent directories beneath your home with an existing parent. Restore uses `--overwrite never` and `--verify`. Include fields accept Restic patterns; leaving them blank restores the whole snapshot. This is file recovery into a staging folder, not automatic OS replacement or a bootable disk-image restore.

Configuration saves check the loaded revision and source path, validate the proposed content, save the previous contents, and replace the source atomically. The review screen displays both old and proposed content. Ghostty edits retain unrelated lines. Fastfetch edits preserve JSONC comments outside rewritten properties and retain custom module options; reordering rewrites the modules array. Previews are illustrative rather than a terminal emulator or executable Fastfetch session.

Health checks do not unlock the backup repository. Package updates reflect `pacman -Qu` against the current local database, without a network refresh. Git ahead/behind counts reflect the last fetch. Missing tools and inaccessible data are shown as unavailable.

## Local data

Linux defaults (respecting the platform's configured app directories):

- Preferences: `~/.config/io.helixstack.commandcenter/settings.json` with a previous-version backup.
- Project groups/profiles: `~/.local/share/io.helixstack.commandcenter/workspace.json`.
- Activity: `~/.local/share/io.helixstack.commandcenter/activity.json`.
- Explicitly saved terminal output: `~/.local/share/io.helixstack.commandcenter/toolbox-output-<timestamp>.txt` (owner-only).
- Configuration backups: `~/.local/share/io.helixstack.commandcenter/config-backups/`.

Activity and configuration backups are written with owner-only permissions. They remain local and can include command output or configuration content. There is no telemetry or cloud service.

## Find and check settings

Use **Search settings** to filter sections by their labels and help text. Clear the search, press Escape, or choose a section link to show all sections again. Filtering retains unsaved changes. **Start page** supports every workspace, including Toolbox, Activity, and Needs attention.

In **System integrations**, choose **Check availability** to inspect the current draft without saving it. Checks report local path types, helper execute permissions, a Home Manager flake, and installed tools. They do not execute helpers, read password contents, unlock KWallet, or contact remote Restic repositories. A present path is not proof that a backup or configuration operation will succeed. Editing integration values clears previous results; run the check again after changes. Browser preview explains that native checks require the desktop app.

## Stage and commit repository changes

Open a repository's **Details** to select whole files and choose **Stage selected**, **Stage all**, or **Unstage selected**. Each action uses the existing command review and Activity system. Stage all includes new files and deletions while respecting Git's ignore rules. Unstage changes only the index; it leaves working files on disk.

Review the **Staged diff**, enter a message, and choose **Review & commit**. A file can have both staged and unstaged edits; only staged contents are committed. Command Center checks the staged tree, current commit, and branch again before starting. If they changed since the preview, refresh Details and review again. Changes by other Git tools after that final check remain possible, so avoid concurrent Git operations in the same repository.

A successful commit is local. Use **Push** separately to publish it. Normal Git hooks, identity and signing settings remain active. If hooks or signing require interactive input, use the repository Terminal button. Conflicts and active merge/rebase/cherry-pick workflows must be finished in the terminal or editor. Large staged diffs and non-UTF-8 filenames require terminal review. Commit messages remain as session drafts after errors or cancelled review; they are cleared after a successful app commit. Details refreshes after a staging or commit job completes while the dialog is open.
