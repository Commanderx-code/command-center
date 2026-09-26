# 🛟 Troubleshooting & FAQ

> _Fixes for common problems._

## Installing and starting

**The .deb or .rpm won't install: "requires libc6 (>= 2.35)" / "GLIBC_2.35".**
Your distribution is older than Command Center supports: it needs glibc 2.35 or newer (Ubuntu 22.04, Debian 12, Fedora 36 or later). Build from source on that machine instead (see [Installation](Installation#building-from-source)).

**The Arch package complains about library versions.**
The Arch package is built against current Arch. Run `sudo pacman -Syu` first, or build it yourself with `makepkg -si` from `packaging/aur/`.

**There's no tray icon.**
Tray icons depend on your desktop. GNOME needs an AppIndicator extension, for example. The app works fully without one.

**Notifications don't appear.**
Install `libnotify` (`notify-send`) and check that notifications are enabled under **Settings → Desktop notifications & tray** and that you're outside **Quiet hours**.

## Running things

**"Wait for "…" to finish."**
Another job is using the same folder, the embedded terminal, or (for workstation tasks) the workstation. Wait, or stop it in **Activity**. See [Running several jobs](How-Commands-Run#running-several-jobs).

**"Settings changed; review the action again."**
Something changed between the review and the start: a setting, a path, a branch. Click the action again to see the updated command.

**"Action preview expired."**
Reviews last 5 minutes. Click the action again.

**A job hangs waiting for input.**
Background jobs can't take input. Use an **Embedded** or **External** mode for anything that asks questions or passwords (quick actions, tasks and personal tools let you pick the mode).

**I can't close the app.**
A job is still running. Wait for it or stop it in **Activity**.

## Repositories

**Push/pull fails with an authentication error.**
Git runs without an interactive prompt. Unlock your SSH key (for example with `ssh-add`) or set up a credential helper, or run the command from the repository's terminal.

**A file shows as changed but `git status` in my terminal says it's clean.**
Previews run with Git filters (such as Git LFS) switched off for safety, so files a filter would normalize can look changed. Check in the terminal. See [Repositories → Good to know](Repositories#good-to-know).

**"Cannot safely inspect Git configuration" / "Unsupported Git filter configuration".**
The repository's Git settings can't be inspected safely without running something. Use the repository terminal for that one.

**Ahead/behind numbers look wrong.**
They're from your last fetch. Click **Fetch**.

**Pull is refused.**
Pull only fast-forwards, on a clean branch. Commit or stash your changes, and resolve diverged branches in the terminal.

## Backups

**The backup buttons are disabled.**
Either the helper isn't set in **Settings → System integrations**, or the health helper says your backup drive is disconnected. Plug it in and click **Refresh health**.

**Backup status says "unknown".**
The health helper didn't report anything. Check its path in Settings and that it prints JSON when run with `--json`.

**Restic asks for a password or KWallet pops up.**
Actions that open the repository (browse, restore, check, access test) unlock it with the credentials in Settings. KWallet may ask you to unlock the wallet. Status checks never unlock it.

**Restic jobs say "Use Restic's credential environment or password file instead of a password embedded in the repository URL".**
Your Restic repository address in Settings contains a password, for example `rest:https://user:password@host/`. Command Center refuses these because the address would be passed to restic on the command line, where other users on the machine can read it. Remove the password from the address. For a REST server, set `RESTIC_REST_USERNAME` and `RESTIC_REST_PASSWORD` in the environment Command Center starts in. 0.7.1 and later also refuse `rest:` addresses with a password; earlier versions let them through.

**File history says the search returned too many matches.**
The pattern matched too many files across all snapshots to display. Search an exact path such as `~/Documents/notes.md`, or a narrower pattern.

**File history finds nothing, but I know the file was backed up.**
Check the spelling, tick **Ignore case**, or search just the file name. Paths are matched as they were backed up, so an exact-path search must use the full path.

**My scheduled backup didn't run.**
User timers run while you're logged in, and missed runs happen at your next login. They don't wake a sleeping or powered-off computer. Check **Service logs** for the backup timer.

## Setup and imports

**The dashboard says an import was rolled back.**
The app or computer stopped during an import, and your previous setup was restored automatically. Import the bundle again.

**"Setup changed after preview."**
Your saved setup changed while the import preview was open. Update the preview and review again.

**My Toolbox favorites disappeared after upgrading.**
From 0.6.0 they're saved with your app data. They're moved over automatically the first time you open Toolbox in the desktop app. If they're gone, star them again, and they'll stay from then on.

## Still stuck?

> [!TIP]
> Check the job's output in **Activity**, then [open an issue](https://github.com/Commanderx-code/command-center/issues) with your version (**Settings → About & updates**), distribution, and the steps to reproduce. Remove anything private from logs first.

---

| | |
|:--|--:|
| [← 🔒 Your Data & Privacy](Your-Data-and-Privacy) | [🏠 Home →](Home) |
