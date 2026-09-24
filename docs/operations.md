# Workflows, profiles, and recovery verification

[← Command Center](../README.md) · [User guide](user-guide.md)

## Maintenance workflows

Open **Workflows**, create a workflow, and add steps in order. Available steps include backup drive readiness, personal backup, Restic checks, package updates, repository fetching, Home Manager build/apply, Toolbox installers, saved quick actions, personal tools, and service/disk checks. Move steps up or remove them before saving.

**Start workflow** opens the progress panel. **Review next step** uses the normal command preview and execution system. Each successful step enables review of the next one; it does not approve or execute subsequent steps automatically. Interactive steps open the embedded terminal. Failures, cancellation, and timeouts stop the sequence. Inspect Activity before retrying a step: an unsuccessful command may already have made partial changes.

**Stop sequence** prevents additional steps. Stop an already running command from Activity or its terminal. Workflow steps are workstation tasks, so only one runs at a time; repository jobs in other folders can run alongside them. On restart, an unfinished sequence is marked interrupted and requires review before retrying. Workflow progress is stored in this webview's local storage; definitions are stored in the app's private `operations.json` file.

The weekly maintenance example checks local backup-drive readiness, runs the personal helper, checks the configured Restic repository, then reports disk usage and failed services. Add your chosen updater explicitly if desired. The readiness step requires a successful health report with `drive_mounted: true`; remote backups or different helper formats should use an appropriate custom preflight instead. The backup helper and Restic browser can use different repositories; configure and verify each.

## Machine profiles

A machine profile is a named, ordered setup recipe for a workstation, laptop, or new install. Add repository clones, Toolbox installers, configuration operations, and other steps through the same editor. Set a profile-specific dotfiles checkout and Home Manager flake profile, or leave them blank to use Settings. These overrides apply only to that profile's reviewed commands.

**Review profile** shows whether each command can be prepared on the current machine. Optional path checks show **Present · inspect before skipping** when a file or directory exists. Presence does not establish that the right version or content is installed. **Skip inspected step** requires confirmation. Missing prerequisites can be satisfied by earlier steps; the app rechecks each command immediately before execution.

Profiles operate on the local computer. They do not connect to remote machines, automatically replace configuration files, or bypass Toolbox installer prompts. Clone destinations must be new directories. Recipes and personal tools live in `operations.json`. In 0.5.0, [setup bundles](setup-and-workspaces.md) include them; preference-only Settings exports still do not.

## Personal Toolbox folders

At the bottom of **Toolbox**, use **Add personal tool** to save a name, folder (for example `Maintenance/Backups`), description, command, working directory, prerequisite executable, and execution mode. Nested folders, Up navigation, and search work within this personal catalog.

Structured inputs support text, existing directories, and Git repository directories. A placeholder must occupy an entire argument, such as:

```text
git -C {repo} status
```

Define an input named `repo` with type **Repository folder**. When run, the app prompts for the value, validates the directory, and shows the resulting command for review. Inputs are passed literally as process arguments without shell expansion. A command can still interpret its arguments itself; review the resulting command, especially when using script interpreters. For pipelines and shell functions, use an existing script file or the saved Fish/Bash quick actions.

The prerequisite field checks whether the executable is available. It does not install dependencies. Editing or importing definitions never runs them.

## Recovery verification

1. Choose a small, regular file beneath your home directory (up to 100 MB).
2. In **Backup & Restore → Recovery verification**, record its SHA-256 checksum.
3. Back up that exact file version with your existing backup workflow.
4. Load snapshots, then copy the matching snapshot ID into the verification form.
5. Select the recorded baseline and **Review recovery test**.

The test uses `restic dump` to restore the selected file into a temporary directory, compares its SHA-256 against the saved baseline, and removes its temporary copy on normal completion. It never overwrites the original. A mismatch or missing file fails visibly in Activity. Abrupt process termination or power loss can leave a temporary copy for normal system temporary-file cleanup.

Recent recovery results include the baseline ID, result, and timestamp. The baseline selector maps IDs to recorded files and dates. Results follow Activity's 100-job retention. Success proves recovery of that selected file from that snapshot using the current credentials; it does not certify all snapshots, all files, or a bootable system restore. A file changed after recording may legitimately mismatch another snapshot.

## Change timeline

**Change timeline** combines retained job records (including package updates, Git operations, backups, services, and profile/workflow commands) with recorded Ghostty/Fastfetch configuration backups. Search by title, result, category, or working directory, and filter by action category. Configuration entries indicate a backup was saved before a write, not that the subsequent configuration activation succeeded.

The timeline does not observe changes made by other applications. Command output remains in Activity; terminal transcripts remain private under the existing terminal behavior.

## Notifications and system tray

In **Settings → Desktop notifications & tray**, opt into completed-task, failed-task, and changed-health notifications. Set quiet hours in local time; matching start/end hours disables quiet hours. Repeated identical health alerts are suppressed for the current session. Health changes are detected when the app refreshes health, not by a separate background daemon.

Notifications require `notify-send` and a working desktop notification service. The settings section reports availability. Notifications omit command output and direct you to Activity for details.

The system tray menu opens, hides, or quits the app. Its tooltip reflects running tasks and the last result on desktops that display tray tooltips. Closing the window still quits normally; use **Hide window** to keep the app running. Quitting while a job is active remains blocked. Tray visibility depends on desktop support; the window works even if tray creation fails.
