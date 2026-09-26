# 📦 Installation

> _Download, install, verify and update Command Center._

Command Center runs on **64-bit Linux (x86_64)**. Download packages from the [latest release](https://github.com/Commanderx-code/command-center/releases/latest).

| Your system | Download | Install |
|---|---|---|
| Debian 12+, Ubuntu 22.04+ and derivatives | `command-center_<version>_amd64.deb` | `sudo apt install ./command-center_0.7.1_amd64.deb` |
| Fedora and other RPM systems | `command-center-<version>-1.x86_64.rpm` | `sudo dnf install ./command-center-0.7.1-1.x86_64.rpm` |
| Arch, Garuda, EndeavourOS, Manjaro | `command-center-<version>-1-x86_64.pkg.tar.zst` | `sudo pacman -U ./command-center-0.7.1-1-x86_64.pkg.tar.zst` |

The `.deb` and `.rpm` need **glibc 2.35 or newer, GTK 3, WebKitGTK 4.1** and the AppIndicator library. The package manager installs these for you. Every release is install- and launch-tested on Ubuntu 22.04, Debian 12, Ubuntu 24.04, Fedora 43 and current Arch.

> [!TIP]
> The Arch package is built against current Arch libraries, so update your system (`sudo pacman -Syu`) before installing it.

After installing, open **Command Center** from your application menu.

> [!WARNING]
> Always run Command Center as your normal user, never with `sudo`.

## Check your download (recommended)

Each release has a `SHA256SUMS` file. Put it in the same folder as your download and run:

```sh
sha256sum --check --ignore-missing SHA256SUMS
```

Your package should report `OK`.

## Optional extras

| Install | To get |
|---|---|
| `libnotify` (`notify-send`) | Desktop notifications |
| `restic` 0.17 or newer | Snapshot browsing, file history, restores and recovery tests |
| `fish` | Fish-shell quick actions and tasks |
| `git` | Repository features (almost certainly installed already) |

> [!NOTE]
> Missing tools never break the app. The features that need them show as unavailable.

## Updating

- **Package installs:** download the new release and install it the same way. Your settings and data are kept.
- **Checking for updates:** **Settings → About & updates → Check for releases** asks GitHub for the latest release and shows its notes. The app only contacts GitHub when you click this.
- **Source installs:** in the same section, **Export source updater** saves a helper script to Downloads. Close the app and run the command it shows, for example `bash ~/Downloads/update-desktop.sh v0.7.1`. It builds the release in a temporary folder, runs the tests, and installs only if they pass. The previous binary is kept as `~/.local/bin/command-center.previous` in case you need to roll back.

## Building from source

On Arch/Garuda, install the build dependencies:

```sh
sudo pacman -S --needed webkit2gtk-4.1 base-devel curl wget file openssl appmenu-gtk-module librsvg nodejs npm rust git
```

Then:

```sh
git clone https://github.com/Commanderx-code/command-center.git
cd command-center
npm ci
npm run desktop:install   # builds and installs to ~/.local/bin for your user
```

`npm run dev` starts a browser preview with sample data at `http://127.0.0.1:4173`. It's handy for looking around, but it can't run commands or read your real files. The full developer guide is in [docs/development.md](https://github.com/Commanderx-code/command-center/blob/main/docs/development.md).

## Uninstalling

Remove the package with your package manager (`sudo apt remove command-center`, `sudo dnf remove command-center` or `sudo pacman -R command-center`). Your settings and history stay in your home folder. See [Your Data & Privacy](Your-Data-and-Privacy) to remove them too.

---

| | |
|:--|--:|
| [← 🏠 Home](Home) | [🏁 Getting Started →](Getting-Started) |
