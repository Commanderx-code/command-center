# Command Center

A local Linux workstation dashboard built with Tauri, Rust, and JavaScript. Version 0.2 connects repository management, Home Manager, existing backup helpers, Ghostty/Fastfetch configuration, and system health.

## What works

- **Repositories:** scan configurable roots, inspect branches and local changes, search/filter/sort, favorites, groups, changed-file lists, recent commits, and editor/terminal/remote launchers. Fetch updates remote-tracking information; pull requires a clean tracked branch and uses fast-forward only; push targets that branch's upstream without force or automatic tags.
- **Launch profiles:** save a documentation URL and choose whether a project opens its editor, terminal, and documentation together.
- **Activity:** preview each command before starting, stream output, stop background jobs, and inspect the last 100 results across app restarts. Only one operation runs at a time. Output is capped at 2 MB per job, and truncation is explicit. Failed jobs can be marked reviewed.
- **System Sync:** inspect dotfiles changes, compare Ghostty/Fastfetch sources with their live files, view Home Manager generations, fetch/pull the config repository, build, and apply Home Manager.
- **Backup & Restore:** run your personal backup helper, run the full recovery helper in a terminal for encryption prompts, load recent Restic snapshots, browse directories, check repository metadata, and restore a snapshot or selected path/pattern into a new folder beneath your home directory.
- **Configuration:** Ghostty font, theme, padding, opacity, and cursor controls; Fastfetch logo/separator controls and module add/remove/reordering. Both include a source editor and illustrative preview. Ghostty uses its installed validator. Fastfetch validates JSONC syntax and module structure; it does not execute command modules or claim full runtime/schema validation.
- **System Health:** filesystem usage, failed user/system services, battery information, cached Arch package updates, installed tools, and locally recorded backup freshness.
- **Needs attention:** changed/unpushed/behind repositories, unreviewed failed jobs, overdue or unavailable backup records, disks at least 90% full, and failed services.
- **Recovery readiness:** check for the dotfiles checkout, Home Manager flake, backup drive, encrypted recovery files, and recovery instructions. Presence checks do not verify decryption or bootable recovery.
- **Preferences:** persistent appearance and application settings, card/list layouts, scan limits, refresh intervals, and editable integration paths.

## Run or install

Install the standard Tauri prerequisites on Arch/Garuda:

```bash
sudo pacman -S --needed webkit2gtk-4.1 base-devel curl wget file openssl appmenu-gtk-module librsvg
npm install
npm run tauri dev
```

To build a release executable and install a per-user application-menu entry:

```bash
npm run desktop:install
```

This installs `~/.local/bin/command-center`, its icon, and a desktop entry. No root access is needed. Launch **Command Center** from your application menu. An existing installed executable is retained as `command-center.previous` when replaced.

Other build commands:

```bash
npm run desktop:build       # release executable, no package
npm run desktop:package     # .deb and .rpm packages under src-tauri/target/release/bundle/
npm run dev                 # browser preview at http://127.0.0.1:4173
```

The browser preview uses sample repositories/configs. It cannot run Git operations, access backups, launch applications, or save real configuration files. Source changes rebuild automatically during preview; refresh the browser to load them.

## Connect your setup

On the first desktop launch without a configured dotfiles integration, Command Center detects your existing `~/.config/dotfiles/machine.json`, installed backup helpers, and Ghostty/Fastfetch source paths. Existing preferences are retained. Review **Settings → System integrations**; **Detect existing setup** can populate a new draft later.

- **Dotfiles repository** points to the checkout. The Home Manager flake may be in its `home-manager/` directory or repository root. **Home Manager profile** is the flake output name, such as `commander`.
- **Backup helpers** are executable paths to your existing `backup-personal`, `backup-everything`, and `backup-health` helpers. The health helper must return the dotfiles backup-health JSON format. These scripts continue using their own machine configuration.
- **Restic repository and credentials** control snapshot browsing, checks, and restores. Use an existing KWallet entry, password file, or inherited Restic credential environment. Password contents are never stored in preferences. A locked wallet can prompt through KWallet.
- **Configuration sources** must be editable files inside your home. Files resolving into `/nix/store` are never modified. For the existing dotfiles layout, a Home Manager-managed Fastfetch config maps to `configs/fastfetch/config.jsonc`. Other layouts can be set manually. Save the source, then build/apply Home Manager to activate it.
- **Recovery instructions** can point to a dedicated recovery document. Detection falls back to the dotfiles README if no recovery-specific file is found; review that choice.

## Operational behavior

Every operation displays its exact command and working directory for review. Git credentials use existing helpers; SSH uses batch mode so unavailable authentication fails visibly instead of waiting for an invisible terminal prompt.

Background jobs show output and a recorded exit status. Full recovery backups use a terminal and write a completion receipt back to the app; terminal input/output is not captured. If the terminal closes without a receipt, use **Terminal closed? Stop monitoring** only after checking that the workflow has stopped. Closing the app normally is blocked while a job is running. After a crash, previously running jobs are marked interrupted; inspect the command before retrying.

Restore destinations must be nonexistent directories beneath your home with an existing parent. Restore uses `--overwrite never` and `--verify`. Include fields accept Restic patterns; leaving them blank restores the whole snapshot. This is file recovery into a staging folder, not automatic OS replacement or a bootable disk-image restore.

Configuration saves check the loaded revision and source path, validate the proposed content, save the previous contents, and replace the source atomically. The review screen displays both old and proposed content. Ghostty edits retain unrelated lines. Fastfetch edits preserve JSONC comments outside rewritten properties and retain custom module options; reordering rewrites the modules array. Previews are illustrative rather than a terminal emulator or executable Fastfetch session.

Health checks do not unlock the backup repository. Package updates reflect `pacman -Qu` against the current local database, without a network refresh. Git ahead/behind counts reflect the last fetch. Missing tools and inaccessible data are shown as unavailable.

## Local data

Linux defaults (respecting the platform's configured app directories):

- Preferences: `~/.config/io.helixstack.commandcenter/settings.json` with a previous-version backup.
- Project groups/profiles: `~/.local/share/io.helixstack.commandcenter/workspace.json`.
- Activity: `~/.local/share/io.helixstack.commandcenter/activity.json`.
- Configuration backups: `~/.local/share/io.helixstack.commandcenter/config-backups/`.

Activity and configuration backups are written with owner-only permissions. They remain local and can include command output or configuration content. There is no telemetry or cloud service.

## Development checks

```bash
npm run check
npm test
npm run test:rust
npm run build
```

The JavaScript suite covers preference migration, project filters, configuration editing, backup result parsing, and UI flows through a simulated desktop bridge. Rust tests exercise real temporary Git remotes, fast-forward/divergence behavior, a temporary encrypted Restic backup and selective restore (when Restic is installed), process cancellation/timeouts, Unicode output, private atomic persistence, and configuration backup/conflict handling. Tests do not push your real repositories, run your real backups, or activate Home Manager.

The application runs as the normal user. Privileged OS installation, package upgrades, disk formatting, and bootloader recovery are outside this release.

References: [Home Manager standalone flakes](https://nix-community.github.io/home-manager/nix-flakes/standalone.html), [Ghostty configuration](https://ghostty.org/docs/config), and the locally installed `restic restore --help` / `restic ls --help` interfaces.
