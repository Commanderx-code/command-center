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

Future catalog updates require updating the pinned revision in `src-tauri/Cargo.toml` and `src-tauri/src/toolbox.rs`, refreshing Cargo.lock, running the [development checks](development.md#checks), and rebuilding. No sibling checkout is needed to build or run Command Center. Toolbox favorites are stored in the app’s private `toolbox-favorites.json` file (0.6.0 and later moves any favorites saved by earlier versions there on first launch). The browser preview keeps them in local storage. Activity records the action ID and bundled revision, but no terminal input or transcript.

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

Open a repository's **Workspace** (called **Details** in 0.4.0) to select whole files and choose **Stage selected**, **Stage all**, or **Unstage selected**. Each action uses the existing command review and Activity system. Stage all includes new files and deletions while respecting Git's ignore rules. Unstage changes only the index; it leaves working files on disk.

Review the **Staged diff**, enter a message, and choose **Review & commit**. A file can have both staged and unstaged edits; only staged contents are committed. Command Center checks the staged tree, current commit, and branch again before starting. If they changed since the preview, refresh Details and review again. Changes by other Git tools after that final check remain possible, so avoid concurrent Git operations in the same repository.

A successful commit is local. Use **Push** separately to publish it. Normal Git hooks, content filters, identity and signing settings remain active for reviewed actions. If hooks or signing require interactive input, use the repository Terminal button.

Automatic repository inspection disables hooks, fsmonitor commands, external diff/text conversion, signature verification, content filters, and automatic fetching of missing objects. Partial clones with missing objects need an explicit fetch in the terminal before inspection. Files normally normalized by a filter may appear changed in these previews; use the repository terminal for a filter-aware comparison. Nested submodule working-file changes are omitted; changed submodule commits remain visible. Open a submodule directly to inspect its files. Unsupported or oversized filter configuration makes inspection unavailable.

Conflicts and active merge/rebase/cherry-pick workflows must be finished in the terminal or editor. Large staged diffs and non-UTF-8 filenames require terminal review. Commit messages remain as session drafts after errors or cancelled review; they are cleared after a successful app commit. Details refreshes after a staging or commit job completes while the dialog is open.

## Review changes and branches

In repository **Workspace**, click a filename to view its diff, then use **Staged** and **Unstaged** to compare index and working-tree contents. **All tracked files** returns to the combined diff; new files have an individual preview before staging. Additions and deletions are colored and retain their +/− prefixes. Binary files receive a summary. Oversized previews are labeled as truncated.

Git operations keep Details open. Status, exit code, and available output appear below the commit controls; **View Activity** opens the operation history. A failed commit retains its draft message. **Refresh details** reloads the file list and diff. Commands remain subject to review before execution.

The **Branches** controls list local branches and support **Switch branch** and **Create & switch**. These require an existing commit, no pending changes (including new files), and no active merge/rebase/cherry-pick. New branches remain local. Use **Review & publish branch** to choose a remote and set the upstream for a new branch. The regular Push action then uses that upstream.

## Transfer settings

**Export saved settings** writes a versioned JSON file to Downloads in the desktop app. In browser preview it downloads a JSON file. The export contains saved preferences, integration paths, and custom commands; it does not read the contents of credential files or KWallet.

**Import settings** opens a preview. Machine paths, editor/terminal selections, scan depth, integration settings, and custom commands remain from this device by default. Select the checkbox to include them from the export. The automatic backup health helper always retains this device’s current value; configure it separately in Settings. **Apply to draft** updates the settings form; **Save settings** persists it, and **Discard changes** restores the saved configuration. Importing and saving commands never runs them.

## Custom quick actions

Add up to 20 actions under **Settings → Custom actions**. Supply a name, command, working folder, shell, and execution mode. Saved actions appear in **Your quick actions** on the dashboard.

- **Direct** splits quoted arguments without shell expansion. Use executable names on PATH or absolute executable paths.
- **Fish** and **Bash** load interactive shell configuration so user functions are available. For example, a Fish action can run `full-upgrade` with `~` as its working folder.
- **Embedded** uses the interactive terminal in Command Center. **External** uses the selected terminal. **Background** records output in Activity and has no interactive input; use a terminal mode for password prompts.

Every run previews the command and working folder and uses the existing job lifecycle, cancellation, and exit reporting. Commands and arguments are recorded in local Activity, so keep passwords out of command text. Custom actions are arbitrary commands run with your normal user permissions; their effects depend on the command you save.

## Backup overview

Backup & Restore shows the location status reported by your backup-health helper, the exact last successful backup time when available, and the next setup step. A missing report is **unknown**, not proof that a drive is disconnected. Remote Restic locations are labeled as not connection-tested. Personal/full backup buttons require an executable configured helper and are disabled while checking health or when the helper explicitly reports a configured local drive disconnected. Refresh after attaching a drive. Helpers retain their own checks and prompts.

## Services and backup timers

**Services** lists installed and loaded units, filters by name/description/state, and displays properties plus the latest 100 journal entries. User services support reviewed start, stop, and restart operations. System services are view-only; available logs depend on your existing journal permissions. Template units without an instance are omitted. A systemd action can continue in the service manager after its command-line client is stopped; inspect the service state before retrying.

**Backup & Restore → Backup schedules & user timers** shows up to 100 user timers with next and last trigger times, enable state, associated service, and that service’s result/exit code. Enable and Disable also start or stop the timer. Stopping a timer does not stop an already running backup. Use **Service logs** to inspect its target service.

The schedule editor supports hourly, daily, and Sunday weekly runs. It writes only `command-center-backup.service` and `command-center-backup.timer` beneath the user systemd configuration directory. It refuses to replace foreign units or symlinked unit files, and keeps `.bak` copies when updating its own units. The command review includes the schedule, helper, unit contents, and install commands. Existing schedules remain untouched: check for duplicates before enabling another backup timer.

Scheduling uses the personal backup helper saved in Settings, not the full recovery helper. It must run unattended and obtain credentials using its existing setup. The schedule follows local time and uses Persistent timers to catch up missed runs when the user service manager resumes. This does not enable lingering or wake a powered-off computer. Your user service manager must be running for the timer to run. An app-created schedule is read back into the form when refreshed; unsaved form edits are retained.

## Stash and publish

In repository Details, **Review & stash** saves tracked working changes and the index. Select **Include new (untracked) files** when needed; ignored files remain untouched. Git needs an existing commit and no unresolved merge/rebase workflow. **Review & restore stash** requires a clean tree, restores the selected stash including staged state, and retains the stash. If Git reports conflicts, resolve them in your editor or terminal before continuing.

**Review & publish branch** pushes the currently committed branch to the selected configured remote and sets its upstream. It never force-pushes, automatically pushes tags, or commits working changes. An existing remote branch may reject a non-fast-forward push; review the divergence before retrying.

## Configuration history

**Configuration → Configuration history** lists the latest 100 saved versions for the selected application. Select a version and **Compare** to see it next to the current draft. **Review restore to draft** previews the replacement and changes only the editor draft. Use the existing **Review & save** action to validate, check the loaded source revision, back up the current file, and write the restored content. For Home Manager-managed configurations, build and apply the source afterward. History is grouped by application rather than original source path; check the current destination in the review.

## Command palette and inventory

Press **Ctrl+K** (Cmd+K on a Mac keyboard) or click **Command palette** to search pages, repositories, and saved custom actions. Use arrow keys and Enter, or click a result. Opening a repository shows Details. Custom actions still require command review. The palette does not interrupt an open confirmation or settings-import dialog.

**System inventory** collects OS/kernel, CPU, memory, storage, disk usage, and installed tool versions. Missing tools or timed-out probes are marked unavailable. **Export displayed report** saves the currently displayed report as JSON in Downloads. The report can include filesystem mount paths and configuration details printed by version commands; inspect it before sharing. Inventory export does not publish or upload it.

### Service filters and cleanup

Services includes All, Active, Inactive, Failed, and Not loaded filters. Search combines with the selected state; inactive means exactly systemd's `inactive` state, not failed or unloaded.

Expand **Service cleanup** and export the helper to Downloads. Exporting never executes it and refuses to overwrite an existing helper. Run `bash ~/Downloads/service-cleanup.sh user` or `bash ~/Downloads/service-cleanup.sh system` to audit inactive/failed services. No age or unused classification is inferred: a scheduled, socket-activated, or one-shot service can normally be inactive.

For a service you have identified as unnecessary, run `bash ~/Downloads/service-cleanup.sh user --disable NAME.service`. For a system service use `sudo bash ~/Downloads/service-cleanup.sh system --disable NAME.service`. The helper shows properties, triggers, reverse dependencies and a re-enable command, then requires typing the full name. It checks state again before disabling. Only loaded, persistently enabled, inactive services qualify. It never deletes unit files, uninstalls packages, masks units, or stops running services. Disabling does not prevent activation by timers, sockets, dependencies, or applications. Failed services require investigation rather than automatic cleanup. Review logs from the service details before proceeding. A service can change state after the final check; disabling does not stop it in that case.

### Clearer service audits

The service list shows enablement and a plain-language category. **Enabled but inactive · review** narrows the list to persistently enabled inactive services; this does not establish that any are unused. The cleanup helper separates these entries from failed services and informational on-demand/managed entries. It prints descriptions and activation triggers. Select a service in the app for properties, reverse dependency names, and logs. If no enabled inactive entries exist, the audit says so. Move your previously exported helper aside and export the new one; existing exports are never overwritten.

### Backup readiness and access tests

Backup & Restore shows executable helpers, Restic availability, helper-reported drive state, credential source status, and helper-provided job records. Passive checks do not unlock KWallet or read password contents. “Configured” is not “authenticated.” **Test repository access** is a reviewed job that reads/decrypts Restic's configuration with the Settings credentials. It can unlock KWallet. Success proves access at that moment, not repository integrity or restoreability. Its result and errors appear in Activity. **Check repository** remains the metadata integrity check. Helper job records show only fields the helper actually reports; missing records are not assumed successful.

Backup helpers may use their own repository/credentials. The health helper's explicit disconnected-drive report blocks personal/full backup plans and is rechecked at job start; unavailable health is labeled unknown. Refresh health after reconnecting. Explicitly failed backup records no longer display a successful backup timestamp.

For release checks, updating, rollback, and preparing your first published release, see [Releases and updates](releases.md).

### Toolbox updates

Expand **Toolbox Updates** inside Toolbox. Checking updates never starts an installer.

- **Check catalog updates** queries the default branch of Commanderx-code/commander-toolbox, compares its commit with the bundled revision, and offers a GitHub comparison. A different revision is not automatically adopted or assumed compatible. Commit your current app changes, then run the displayed `npm run toolbox:pin -- SHA` command in the Command Center source checkout. It fetches that exact commit, updates the dependency pin and displayed revision together, refreshes Cargo.lock, and runs JavaScript/native tests. If validation fails, the original pins and lockfile are restored. Review the diff, close the app, build/install, and restart. The running catalog stays pinned until rebuilt.
- **Check installed-tool updates** groups results by package source. Arch uses `checkupdates` when available (fresh query with a separate database), or a clearly labeled cached `pacman -Qu` fallback. Flatpak checks user and default-system remotes separately. Foreign/AUR packages are shown as inventory only, not as proven updates. Other named Flatpak system installations and manually installed binaries/source/language packages require their own update workflow.
- **Review & update** detects full-upgrade in an interactive fish shell, Topgrade, Garuda's updater, an Arch fallback, and Flatpak. Fish detection loads your normal interactive configuration. These are whole-system or package-source operations; Toolbox cannot attribute installed packages to its installer entries. Choose one broad workflow or individual managers to avoid running the same updates twice. The command is reviewed through Activity and runs with normal interactive prompts in the selected embedded/external terminal. No automatic confirmation flags are added. Review/export embedded terminal output using its existing controls. External terminal output stays external.

A failed or unavailable check is never shown as “up to date.” Zero entries from cached data are not proof that no newer versions exist. Recheck after an update; displayed results become stale when you launch an update.

## Workflows, machine profiles, and personal tools

See [Workflows, profiles, and recovery verification](operations.md) for the new recipe editor, personal Toolbox catalog, checksum recovery tests, change timeline, and notification/tray preferences.

## Setup and project workspaces (0.5.0)

See [Setup bundles, onboarding, and project workspaces](setup-and-workspaces.md) for reviewed setup transfer, first-run detection, repository tasks, and keyboard navigation.
