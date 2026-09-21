# Changelog

Release downloads and full notes are available on [GitHub Releases](https://github.com/Commanderx-code/command-center/releases).

## Unreleased

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

Linux x86_64 `.deb` and `.rpm` packages require glibc 2.39+, GTK 3, and WebKitGTK 4.1. Cross-distribution installation has not yet been tested.

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

The release binaries require glibc 2.39 or newer, GTK 3, and WebKitGTK 4.1. They were built on Arch/Garuda; cross-distribution installation has not yet been tested.
