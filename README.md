<p align="center">
  <img src="src-tauri/icons/command-center.svg" alt="Command Center icon" width="88" />
</p>

<h1 align="center">Command Center</h1>

<p align="center"><strong>Your Linux workstation, under control.</strong></p>

<p align="center">
  A desktop home for your repositories, Toolbox, configuration, backups, and system health.<br />
  Built with Tauri, Rust, and JavaScript. Runs locally, with no account or cloud service.
</p>

<p align="center">
  <a href="https://github.com/Commanderx-code/command-center/releases/latest"><img src="https://img.shields.io/github/v/release/Commanderx-code/command-center?style=flat-square&amp;color=27b7cd" alt="Latest release" /></a>
  <img src="https://img.shields.io/badge/platform-Linux-27b7cd?style=flat-square" alt="Platform: Linux" />
  <img src="https://img.shields.io/badge/desktop-Tauri_2-7371fc?style=flat-square" alt="Desktop: Tauri 2" />
</p>

<p align="center">
  <a href="https://github.com/Commanderx-code/command-center/releases/latest">Download</a> ·
  <a href="docs/installation.md">Installation</a> ·
  <a href="docs/user-guide.md">User guide</a> ·
  <a href="CONTRIBUTING.md">Contributing</a> ·
  <a href="https://github.com/Commanderx-code/command-center/issues">Feedback</a>
</p>

![Command Center dashboard showing repository status, configuration, backup, and system-health cards](docs/images/dashboard.jpg)

_Dashboard in browser preview mode with sample data. System integrations run in the desktop app._

## One place for everyday workstation tasks

Command Center brings [Commander Toolbox](https://github.com/Commanderx-code/commander-toolbox) into a graphical desktop app and connects it to the tools you already use. Browse installers, review commands, manage Git repositories, and work with your existing Home Manager and Restic setup.

| Workspace                | What you can do                                                                                                                                                             |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Toolbox**              | Browse 215 bundled actions through the TUI's folders and submenus. Search, save favorites, and choose Myfish, dotfiles, or application setups.                              |
| **Interactive terminal** | Run Toolbox actions with real keyboard input, password prompts, resizing, cancellation, and exit status. Choose an external terminal when needed.                           |
| **Repositories**         | Inspect changes and history, stage files, review and commit staged changes, fetch, pull, push, organize projects, and open your editor, terminal, or project documentation. |
| **System Sync**          | Review dotfiles changes and Home Manager generations, then build and apply your configuration.                                                                              |
| **Backup & Restore**     | Run your backup helpers, browse Restic snapshots, and restore files into a new folder.                                                                                      |
| **Configuration**        | Edit Ghostty and Fastfetch through visual controls or source editors, with validation and backups.                                                                          |
| **Health & Activity**    | Check disk space, services, backup freshness, and repository attention items. Review commands and recorded job results.                                                     |

The app runs as your normal user. Commands are reviewed before execution; Toolbox scripts retain their own privilege checks and confirmations. Integration paths are editable in **Settings**. See the [user guide](docs/user-guide.md) for exact behavior and limitations.

## New in 0.5.0

- Portable setup bundles with a full import preview, home-path remapping, and backups before replacement.
- A first-run wizard for existing Commander-os/Home Manager and Restic connections.
- Project workspaces with reviewed build/test/dev tasks, manifest suggestions, and related service inspection.
- Keyboard navigation, focus, and reduced-motion improvements.

Read [Setup and project workspaces](docs/setup-and-workspaces.md) for setup, import behavior, and task execution.

## New in 0.4.0

- Guided maintenance workflows and local machine setup profiles.
- Personal Toolbox folders with prerequisites and structured inputs.
- Recovery tests against recorded SHA-256 baselines.
- Searchable change timeline, opt-in notifications, and a system tray.
- Service management, backup schedules, Git branches/stashes/diffs, and update checks.
- Ubuntu/Fedora package CI and a local Arch package recipe.

Read [Workflows, profiles, and recovery verification](docs/operations.md) for setup and behavior.

## Download and install

**[Get the latest release →](https://github.com/Commanderx-code/command-center/releases/latest)**

| Package         | Download v0.5.0                                                                                                                 | Install the downloaded file                            |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Debian / Ubuntu | [`.deb` · amd64](https://github.com/Commanderx-code/command-center/releases/download/v0.5.0/command-center_0.5.0_amd64.deb)     | `sudo apt install ./command-center_0.5.0_amd64.deb`    |
| Fedora / RPM    | [`.rpm` · x86_64](https://github.com/Commanderx-code/command-center/releases/download/v0.5.0/command-center-0.5.0-1.x86_64.rpm) | `sudo dnf install ./command-center-0.5.0-1.x86_64.rpm` |

Version 0.5.0 packages require **Linux x86_64, glibc 2.39+, GTK 3, and WebKitGTK 4.1**. Release notes identify the build environment and completed distribution checks. Release assets include `SHA256SUMS` for verification.

For Arch/Garuda, build and install from source using the [installation guide](docs/installation.md#from-source-on-archgaruda).

## Get started

1. Launch **Command Center** from your application menu.
2. Open **Settings** to choose repository scan folders, your editor, and your terminal.
3. Review **Settings → System integrations** to connect existing dotfiles, Home Manager, backup helpers, and Restic credentials.
4. Open **Toolbox** to browse folders, choose an action, and **Review & run**.

Existing integrations can be detected on first launch or with **Detect existing setup**. Missing tools are shown as unavailable. Read [Connect your setup](docs/user-guide.md#connect-your-setup) for configuration details.

## Develop locally

With a supported Node.js version and npm installed:

```bash
git clone https://github.com/Commanderx-code/command-center.git
cd command-center
npm ci
npm run dev
```

Open `http://127.0.0.1:4173` for a browser preview with sample data. Desktop operations require Rust and the Linux system dependencies listed in the [installation guide](docs/installation.md). See [Development](docs/development.md) for checks, architecture, and packaging.

## Documentation

- [Installation](docs/installation.md) — packages, requirements, checksums, and source builds.
- [User guide](docs/user-guide.md) — features, integrations, command behavior, and local data.
- [Development](docs/development.md) — repository layout, checks, and Toolbox updates.
- [Workflows and profiles](docs/operations.md) — maintenance recipes, personal tools, recovery tests, and notifications.
- [Changelog](CHANGELOG.md) — release highlights.
- [Contributing](CONTRIBUTING.md) — bug reports, feature requests, and pull requests.
- [Third-party notices](THIRD_PARTY.md) — bundled components and their notices.

## Built with

[Tauri](https://github.com/tauri-apps/tauri) provides the desktop shell, Rust handles local system operations, and JavaScript renders the interface. The Toolbox catalog and scripts come from [Commander Toolbox](https://github.com/Commanderx-code/commander-toolbox), built on Linutil. [xterm.js](https://github.com/xtermjs/xterm.js) and [portable-pty](https://github.com/wezterm/wezterm) power the embedded terminal.
