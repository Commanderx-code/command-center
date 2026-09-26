<div align="center">

# 📝 Changelog

Release highlights for Command Center. Downloads and full notes are on **[GitHub Releases](https://github.com/Commanderx-code/command-center/releases)**.

<sub>[🏠 README](README.md) &nbsp;·&nbsp; [📚 Docs](docs/README.md) &nbsp;·&nbsp; [⬇️ Latest release](https://github.com/Commanderx-code/command-center/releases/latest)</sub>

</div>

| Version                      | Date       | Highlights                                                     |
| ---------------------------- | ---------- | -------------------------------------------------------------- |
| 🔒 [0.7.1](#071--2026-09-25) | 2026-09-25 | Security release                                               |
| ✨ [0.7.0](#070--2026-09-24) | 2026-09-24 | Backup file history, Wiki user guide                           |
| ✨ [0.6.0](#060--2026-09-24) | 2026-09-24 | MIT license, merge imports, parallel jobs, glibc 2.35 packages |
| 🔒 [0.5.1](#051--2026-09-24) | 2026-09-24 | Security release                                               |
| ✨ [0.5.0](#050--2026-09-23) | 2026-09-23 | Setup bundles, first-run wizard, project tasks                 |
| ✨ [0.4.0](#040--2026-09-22) | 2026-09-22 | Workflows, machine profiles, recovery tests, notifications     |
| ✨ [0.3.3](#033--2026-09-21) | 2026-09-21 | Staging and commits, settings search                           |
| 🚀 [0.3.2](#032--2026-09-21) | 2026-09-21 | Toolbox catalog, embedded terminal, first packages             |

## [0.7.1](https://github.com/Commanderx-code/command-center/releases/tag/v0.7.1) — 2026-09-25

> [!IMPORTANT]
> **Security release.** All 0.7.0 users should upgrade.

- Per-file diffs in Repository Details no longer inspect nested submodule working files, so a submodule's own Git filters cannot run when you view its diff. The file list and full diff already worked this way.
- **Read recovery notes** refuses devices, FIFOs and other non-regular files and reads at most 256 KB, so a setting such as `/dev/zero` can no longer exhaust memory.
- `settings.json` and its `.bak` backup are written readable only by you (0600), like the app's other private data. Existing files are tightened the next time settings are saved.
- Restic `rest:` repository addresses with an embedded password are refused, as other URLs with passwords already were, instead of passing the password on restic's command line.
- Job output from a hostile Git server can no longer freeze the app. Escape-sequence cleaning is now linear; displayed output is unchanged.

## [0.7.0](https://github.com/Commanderx-code/command-center/releases/tag/v0.7.0) — 2026-09-24

- Added **Backup file history**: search every Restic snapshot for a file name, path or pattern, see each saved copy with its snapshot time, size and modification time, spot the versions that changed or a file that was deleted, and restore a chosen version into a new folder.
- Added a [Wiki user guide](https://github.com/Commanderx-code/command-center/wiki) covering every page and feature, linked from the README.

## [0.6.0](https://github.com/Commanderx-code/command-center/releases/tag/v0.6.0) — 2026-09-24

- Command Center is now licensed under the MIT License. Packages include the license and third-party notices.
- Added **Merge** setup imports: keep this machine's preferences and definitions, add new ones, fill empty integration paths, and list differing items that were kept. **Replace** remains available.
- Setup imports keep a journal; an import interrupted by a crash or power loss is rolled back from its backup at the next launch and reported on the dashboard.
- Jobs now run concurrently when they use different resources: repository jobs and project tasks in different repositories, plus one workstation task. Each job is stopped individually, waiting jobs name what they wait for, and the tray shows the running count.
- Packages are built on Ubuntu 22.04 and require glibc 2.35+ (was 2.39). CI install-tests them on Ubuntu 22.04/24.04, Debian 12, and Fedora 43, and builds, lints, installs, and launches the Arch recipe in a clean container. Package validation now checks the binary's real glibc needs.
- `release:draft` publishes the CI-built, install-tested packages and links the workflow run in the notes.
- Toolbox favorites moved from webview storage to app data (migrated on first launch) and are part of the import transaction.
- File replacements now sync their directory for durability. Repository Details disables actions only while that repository has a running job.
- The Arch recipe declares its direct library dependencies and the MIT license.
- Internal: configuration editor split out of `features.js`; removed a stale v0.1.0 archive from the repository.

## [0.5.1](https://github.com/Commanderx-code/command-center/releases/tag/v0.5.1) — 2026-09-24

> [!IMPORTANT]
> **Security release.** All 0.5.0 users should upgrade.

- Automatic repository inspection no longer runs repository-configured programs: hooks, fsmonitor commands, content filters, external diff/text conversion, signature verifiers, and promisor fetches are disabled for status, diff, and log previews. Reviewed Git actions keep normal hooks, filters, and signing.
- Changed submodule commits remain visible; nested submodule working files are no longer inspected automatically.
- Setup bundles and settings imports can no longer replace the automatically run backup health helper. This machine's helper, including an empty value, is always kept.

## [0.5.0](https://github.com/Commanderx-code/command-center/releases/tag/v0.5.0) — 2026-09-23

- Added portable setup bundles for preferences, repositories, workspace profiles/tasks, workflows, machine profiles, personal tools, and Toolbox favorites.
- Added reviewed import with home-directory remapping, credential-reference exclusions, previous-state backups, write-failure rollback, and no automatic command execution.
- Added a first-run setup wizard with draft-only detection, editable connections, prerequisite checks, and machine-profile inspection.
- Added per-repository tasks, read-only npm/Cargo task detection, embedded/background/external execution, and related service inspection.
- Preserve saved tasks when updating repository organization and launch profiles.
- Added a skip link, active-page semantics, navigation arrow keys, heading focus, and OS reduced-motion support.

## [0.4.0](https://github.com/Commanderx-code/command-center/releases/tag/v0.4.0) — 2026-09-22

- Added saved maintenance workflows with per-step command review, progress, failure stops, and explicit retries.
- Added local machine setup profiles with repository clones, Toolbox installers, optional presence checks, and Home Manager source overrides.
- Added personal Toolbox folders, prerequisites, and literal structured inputs.
- Added file recovery verification against recorded SHA-256 baselines using Restic.
- Added a searchable change timeline combining jobs and configuration backups.
- Added opt-in task/health notifications, quiet hours, and system tray controls.
- Added Ubuntu/Fedora package build, installation, and launch CI, package validation, and an unsubmitted Arch build recipe.

- Add Toolbox catalog comparison and a tested pin/rebuild workflow with rollback on validation failure.
- Add package-source update checks and reviewed full-upgrade, Topgrade, Garuda/Arch, and Flatpak workflows.

- Group service audit results and explain enablement/activation.
- Add backup readiness details, explicit repository authentication tests, and fresh disconnected-drive checks before backups.
- Add installed-version display, on-demand stable-release checks, a reviewed source updater, and a draft release workflow.
- Treat failed backup-health exits and explicitly failed backup records as failures.

- Add service state filters and an exportable audit-first cleanup helper with individually confirmed disabling and re-enable instructions.

- Added user-service controls, system-service inspection, and journal views.
- Added timer inspection and an app-owned personal backup schedule editor.
- Added stash/restore and branch publishing with explicit command review.
- Added configuration backup comparison and restore-to-draft.
- Added a global command palette and exportable system inventory.

- Added file-by-file colored staged/unstaged diffs and persistent Git operation feedback in Details.
- Added local branch creation and switching with clean-tree and active-operation checks.
- Added settings export to Downloads and previewed imports with optional machine settings.
- Added saved dashboard quick actions with direct, Fish, or Bash commands and embedded, external, or background execution.
- Added a backup overview with explicit connected/disconnected/unknown states and helper availability.

## [0.3.3](https://github.com/Commanderx-code/command-center/releases/tag/v0.3.3) — 2026-09-21

- Added staging, unstaging, staged diff review, and local commits in repository Details, with command review and Activity results.
- Added settings search and section navigation that preserve unsaved drafts.
- Added integration availability checks for draft paths, helpers, and installed tools.
- Enabled every workspace as a startup page and improved stale health-result handling.
- Refreshed repository documentation and download links.

> [!NOTE]
> Linux x86_64 `.deb` and `.rpm` packages require glibc 2.39+, GTK 3, and WebKitGTK 4.1. Cross-distribution installation has not yet been tested.

## [0.3.2](https://github.com/Commanderx-code/command-center/releases/tag/v0.3.2) — 2026-09-21

### Highlights

- Integrated the 215-action Commander Toolbox catalog with matching folders, nested submenus, breadcrumbs, folder search, and favorites.
- Added graphical quick setup selectors for Myfish, dotfiles, and applications.
- Added an embedded interactive terminal with keyboard input, resizing, cancellation, exit status, and external-terminal support.
- Updated bundled Toolbox and custom configuration sources to the tested revisions listed below.
- Published Linux x86_64 `.deb` and `.rpm` packages with SHA-256 checksums.

This release also includes repository management, Home Manager integration, backup and recovery helpers, Ghostty/Fastfetch configuration controls, system health, and Activity history.

### Bundled source revisions

| Source              | Revision                                                                                                          |
| ------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Commander Toolbox   | [`6a7edbf`](https://github.com/Commanderx-code/commander-toolbox/commit/6a7edbf834ee60c88bd24f7c6cab853329c8f38e) |
| Myfish              | `24bd2d42c197eb34812327c7b9760383d5fa0390`                                                                        |
| Dotfiles / Starship | `78f46c432fa10ccc0ace7738db9249e8affa3f4e`                                                                        |

### Package compatibility

> [!NOTE]
> The release binaries require glibc 2.39 or newer, GTK 3, and WebKitGTK 4.1. They were built on Arch/Garuda; cross-distribution installation has not yet been tested.
