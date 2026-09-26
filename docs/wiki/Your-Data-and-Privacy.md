# 🔒 Your Data & Privacy

> _What's stored, where, and what never leaves your machine._

Command Center is local-only. There's no account, no cloud service and no telemetry. It contacts the internet only when you do something that needs it: Git fetch, pull and push, Toolbox installers downloading their packages, update checks you click, or Restic reaching a remote repository.

## What's stored, and where

| What | Where |
|---|---|
| Preferences (plus the previous version as `.bak`) | `~/.config/io.helixstack.commandcenter/settings.json` |
| Project groups, launch profiles, tasks | `~/.local/share/io.helixstack.commandcenter/workspace.json` |
| Workflows, machine profiles, personal tools, notifications | `~/.local/share/io.helixstack.commandcenter/operations.json` |
| Toolbox favorites | `~/.local/share/io.helixstack.commandcenter/toolbox-favorites.json` |
| Activity (last 100 jobs, including their output) | `~/.local/share/io.helixstack.commandcenter/activity.json` |
| Configuration backups | `~/.local/share/io.helixstack.commandcenter/config-backups/` |
| Pre-import backups | `~/.local/share/io.helixstack.commandcenter/setup-backups/` |
| Terminal output you chose to save | `~/.local/share/io.helixstack.commandcenter/toolbox-output-<time>.txt` |

These files are readable only by you.

> [!IMPORTANT]
> Before 0.7.1, `settings.json` and its `.bak` were readable by other users on the machine. After upgrading, save your settings once to make them private.

Activity can contain command output and configuration backups contain your config files, so treat them like any private file.

To remove everything after uninstalling, delete those two `io.helixstack.commandcenter` folders.

## What's never stored

- **Passwords.** The app stores *where* a password is (a KWallet entry or a file path), never the password itself.
- **What you type in the terminal**, including passwords. Terminal output is kept in memory only, unless you click **Save output**.

## What runs without asking

Only read-only checks: Git status and diffs (with repository hooks and filters disabled), disk and service status, file-presence checks, and your **backup health helper**. Everything else is shown for review first. See [How Commands Run](How-Commands-Run#what-runs-without-asking).

## Imports are safe to preview

Setup bundles and settings files never run anything, never change your backup health helper, and never bring in password locations. See [Moving to a New Machine](Moving-to-a-New-Machine).

---

| | |
|:--|--:|
| [← 🚚 Moving to a New Machine](Moving-to-a-New-Machine) | [🛟 Troubleshooting & FAQ →](Troubleshooting-and-FAQ) |
