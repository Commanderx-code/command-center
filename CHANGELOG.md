# Changelog

Release downloads and full notes are available on [GitHub Releases](https://github.com/Commanderx-code/command-center/releases).

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
