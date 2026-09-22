Command Center 0.4.0 adds complete workstation routines alongside the expanded Git, service, backup, and Toolbox interfaces.

### New workflows

- Save maintenance sequences with command review before each step, visible progress, failure stops, and explicit retries.
- Create local machine setup profiles with repository clones, Toolbox installers, presence checks, and Home Manager source overrides.
- Organize personal tools in folders with descriptions, prerequisites, and typed inputs passed as literal arguments.
- Restore individual backup files into a temporary directory and verify them against recorded SHA-256 baselines.
- Search app-recorded changes across jobs and configuration backups in the timeline.
- Opt into task and health notifications with quiet hours; use the tray to hide or reopen the app.

### Also included since 0.3.3

Git file diffs, branches, stashes, branch publishing, service controls and audit helpers, backup schedules and readiness/access checks, configuration history, settings transfer, custom quick actions, the command palette, system inventory, release checks, and Toolbox/package update workflows.

### Linux downloads

The `.deb` and `.rpm` assets target **x86_64** and require **glibc 2.39+, GTK 3, WebKitGTK 4.1, and the platform's AppIndicator library**. Notifications additionally use `notify-send`. Install your downloaded package with `sudo apt install ./command-center_0.4.0_amd64.deb` or `sudo dnf install ./command-center-0.4.0-1.x86_64.rpm` on a compatible distribution.

Download `SHA256SUMS` beside the package and run `sha256sum --check --ignore-missing SHA256SUMS`.

A local Arch build recipe is included under `packaging/aur/`; it has not been submitted to AUR. See the workflow run and validation details below for tested environments.

### Behavior to know

Workflows require review for each step. Profiles configure this computer and do not manage remote hosts. Recovery verification proves the selected file matches its recorded baseline, not that the entire system is recoverable. Notifications run while the app is open. The timeline covers app-recorded changes. Details: [operations guide](https://github.com/Commanderx-code/command-center/blob/v0.4.0/docs/operations.md).
