# Command Center

Command Center is a Linux control deck for repositories, system sync, configuration, backup, recovery, and health. Phase 1 establishes the visual shell and a working repository dashboard.

## Phase 1 features

- Discover Git repositories beneath configurable scan folders
- Show branch, clean/dirty state, modified-file count, ahead/behind state, remote, and latest commit
- Search and filter repositories
- Open a repository in VS Code, a terminal, or its remote URL
- Responsive dashboard with clear extension points for later modules
- Safe architecture: the app runs as the normal user; future privileged operations must use narrowly scoped Polkit actions

The browser preview uses sample repository data. Real filesystem scanning activates in the Tauri desktop build.

## Preview the interface

```bash
npm run dev
```

Open `http://127.0.0.1:4173`.

## Run the desktop app on Garuda / Arch

Install the Tauri prerequisites and Rust:

```bash
sudo pacman -S --needed webkit2gtk-4.1 base-devel curl wget file openssl appmenu-gtk-module librsvg
rustup default stable
npm install
npm run tauri dev
```

Build an installable package with:

```bash
npm run tauri build
```

## Roadmap

1. **Repositories** — finish editor/terminal preferences, fetch/pull/push actions, favorites, groups, and stale/unpushed warnings.
2. **System sync** — detect the dotfiles repository, preview drift, pull, and run `home-manager switch` with a visible command log.
3. **Backup and restore** — integrate the existing Restic scripts, snapshot browsing, verification, selective restore, and recovery checklists.
4. **Configuration** — schema-aware editors and previews for Ghostty and Fastfetch, followed by Fish, Starship, Git, and Neovim.
5. **System health** — failed user/system services, package updates, filesystem use, battery, backup freshness, and SMART/NVMe status.

## Security boundary

Repository inspection and user configuration stay unprivileged. Command Center must never run as root. Future system-level changes should be implemented through reviewed, narrowly scoped commands invoked through Polkit, with a confirmation screen and command log.
