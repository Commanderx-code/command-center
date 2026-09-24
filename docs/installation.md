# Installation

[← Command Center](../README.md) · [User guide](user-guide.md) · [Development](development.md)

## Release packages

Download a package and `SHA256SUMS` from the [GitHub releases page](https://github.com/Commanderx-code/command-center/releases/latest).

Packages target **Linux x86_64 / amd64** and require **GTK 3, WebKitGTK 4.1, and glibc 2.35 or newer** from 0.6.0 (0.5.x packages require glibc 2.39). Packages declare these dependencies. Both packages are built once on Ubuntu 22.04, then installed and launched on Ubuntu 22.04, Debian 12, Ubuntu 24.04, and Fedora 43. See the release notes for the workflow run. ARM, Windows, and macOS packages are not currently published.

To verify a downloaded package, put it and `SHA256SUMS` in the same directory and run:

```bash
sha256sum --check --ignore-missing SHA256SUMS
```

Each downloaded package must report `OK`. The `--ignore-missing` option lets you download only the package you need.

On a compatible Debian/Ubuntu system:

```bash
sudo apt install ./command-center_0.6.0_amd64.deb
```

On a compatible Fedora/RPM system:

```bash
sudo dnf install ./command-center-0.6.0-1.x86_64.rpm
```

On Arch or an Arch-based system such as Garuda (0.6.0 and later):

```bash
sudo pacman -U ./command-center-0.6.0-1-x86_64.pkg.tar.zst
```

The Arch package is built from the release tag with `packaging/aur/PKGBUILD` in a clean Arch container and tracks current Arch libraries; update your system before installing it. To build it yourself instead, run `makepkg -si` from a copy of `packaging/aur/`.

Launch **Command Center** from your application menu. Run the app as your normal user, without `sudo`.

## From source on Arch/Garuda

Development requires Git, npm, a stable Rust toolchain with Cargo, and Node.js compatible with the locked dependencies. The current test tooling accepts Node **22.22.2+ within 22.x**, **24.15.0+ within 24.x**, or **26+**. The current build was validated with Node 22.23.2 and Rust 1.98.1.

Install the desktop build dependencies:

```bash
sudo pacman -S --needed webkit2gtk-4.1 base-devel curl wget file openssl appmenu-gtk-module librsvg
```

Clone the repository and install JavaScript dependencies:

```bash
git clone https://github.com/Commanderx-code/command-center.git
cd command-center
npm ci
```

Run the desktop app during development:

```bash
npm run tauri dev
```

Or build and install it for your user:

```bash
npm run desktop:install
```

The per-user installer writes `~/.local/bin/command-center`, an icon, and a desktop entry under `~/.local/share/`. It does not need root access. An existing executable is retained as `command-center.previous` before replacement.

## Build commands

| Command                   | Result                                                         |
| ------------------------- | -------------------------------------------------------------- |
| `npm run dev`             | Browser preview at `http://127.0.0.1:4173`.                    |
| `npm run build`           | Frontend assets in `dist/`.                                    |
| `npm run desktop:build`   | Release executable in `src-tauri/target/release/`.             |
| `npm run desktop:install` | Release executable and per-user application-menu entry.        |
| `npm run desktop:package` | `.deb` and `.rpm` files in `src-tauri/target/release/bundle/`. |

The browser preview uses sample repositories and configurations. It cannot run Git operations, access backups, launch applications, or save real configuration files. Source changes rebuild automatically; refresh the browser to load them.

## Connect integrations

After installation, open **Settings → System integrations**. Command Center can detect an existing dotfiles machine configuration, backup helpers, and Ghostty/Fastfetch source paths. Review the detected paths and save your settings.

Git, Home Manager, Restic, Ghostty, Fastfetch, and backup helpers are used when installed and configured. They are not all required to open the app. See the [user guide](user-guide.md#connect-your-setup) for each integration.

File restores require **Restic 0.17 or newer** for its no-overwrite protection; Command Center checks support before preparing a restore. Some distributions ship an older Restic independently of Command Center.
