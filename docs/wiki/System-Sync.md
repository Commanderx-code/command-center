# 🔄 System Sync

> _Dotfiles and Home Manager, one reviewed step at a time._

**System Sync** is for people who manage their setup with a **dotfiles repository** and **Home Manager** (Nix). It shows what's changed in your configuration and applies it, one reviewed step at a time.

Set up the connection first in **Settings → System integrations**: **Dotfiles repository** (the checkout) and **Home Manager profile** (the flake output name, for example `commander`). The flake can sit at the repository root or in `home-manager/`.

## What you see

- **Pending source changes:** files changed in your dotfiles checkout, with their diff, plus the branch and how far it is ahead of or behind the remote.
- **Live configuration comparison:** whether your Ghostty and Fastfetch **source** files (in the dotfiles) match the **live** files Home Manager generated, so you can tell what an apply would change.
- **Home Manager generations:** your recent generations, useful for checking what's active or planning a rollback.

## Updating and applying

| Button | What it does |
|---|---|
| **Fetch** | Downloads remote changes to your dotfiles without touching your files |
| **Pull updates** | Brings them in (fast-forward only) |
| **Build configuration** | Builds your Home Manager configuration without activating it. A safe way to check for errors |
| **Apply Home Manager** | Builds and switches to the new configuration |

Each one shows its exact command for review first.

> [!TIP]
> A typical update is **Fetch → Pull updates → Build configuration → Apply Home Manager**. Save that as a [workflow](Workflows-and-Machine-Profiles) if you do it often.

## How it fits with Configuration

The [Configuration](Configuration) page edits your Ghostty and Fastfetch **source** files in the dotfiles. Those edits take effect only after **Apply Home Manager** here. The Configuration page reminds you when a file is managed by Home Manager.

---

| | |
|:--|--:|
| [← 🗄️ Backup & Restore](Backup-and-Restore) | [🎛️ Configuration →](Configuration) |
