# 🏁 Getting Started

> _The setup wizard, connecting your tools, and your first action._

## 1. The setup wizard

The first time you open Command Center, the **setup wizard** appears. You can reopen it any time from **Settings → Setup & portability → Setup wizard**. It has four steps, and nothing is saved until the last one:

1. **Your workspace:** pick a display name and the folders where your Git repositories live (for example `~/github/projects`). Use absolute paths or paths starting with `~/`.
2. **Connect existing tools:** click **Detect existing setup**. The app looks for your dotfiles checkout (`~/.config/dotfiles/machine.json`), Home Manager profile, and backup helpers, and fills in any empty fields. Check what it found and correct anything that's wrong.
3. **Check this machine:** **Check prerequisites** confirms the paths exist and tools such as Git, Nix, Home Manager and Restic are installed. Nothing is installed here: use **Open Toolbox** for missing software. If you've saved a **machine profile**, **Inspect profile** shows which of its steps are ready (see [Workflows & Machine Profiles](Workflows-and-Machine-Profiles)).
4. **Review & save.** Saving only stores your connections. It doesn't run installers or apply Home Manager.

> [!TIP]
> Setting up a second machine? Choose **Import an existing setup…** in step 1 instead. See [Moving to a New Machine](Moving-to-a-New-Machine).

## 2. Finish connecting your setup

Open **Settings → System integrations** to review everything the wizard didn't cover:

- **Dotfiles repository** and **Home Manager profile** (the flake output name, such as `commander`).
- **Backup helpers:** your personal backup script, full backup script, and **backup health helper** (a script that prints JSON; it runs automatically for status checks, so point it only at a script you trust).
- **Restic repository** and how to unlock it: a **KWallet** entry, a **password file**, or credentials already in your environment. The app never stores your password itself.
- **Ghostty** and **Fastfetch** source files: the editable files in your dotfiles, not the generated copies in `/nix/store`.

Click **Check availability** to test the values before saving. See [Settings](Settings) for every option.

## 3. Find your way around

The left sidebar lists every page:

| Page | What's there |
|---|---|
| Dashboard | Status cards and your quick actions |
| Needs attention | Everything waiting for you |
| Repositories | All your Git projects |
| Toolbox · Terminal | Installers and their interactive sessions |
| Workflows | Saved routines and machine profiles |
| System Sync | Dotfiles and Home Manager |
| Backup & Restore | Backups, snapshots, restores, schedules |
| Configuration | Ghostty and Fastfetch editors |
| System Health · Services · System inventory | Machine status |
| Activity · Change timeline | What ran, and what changed |
| Settings | Everything configurable |

### Keyboard shortcuts

| Keys | Action |
|---|---|
| **Ctrl+K** | Command palette: jump to any page, repository or quick action |
| **↑ / ↓**, **Home / End** (in the sidebar) | Move between pages; **Enter** opens one |
| **Tab** at the top of the window | Shows **Skip to main content** |
| **Esc** | Close a dialog or clear the settings search |

The app follows your system's reduced-motion setting.

## 4. Try your first action

1. Open **Repositories** and click **Workspace** on any project.
2. Click **Fetch**. A review window shows the exact `git fetch` command and folder.
3. Click **Run action**. The result appears below the buttons and in **Activity**.

> [!NOTE]
> That review-then-run pattern works the same everywhere in the app. [How Commands Run](How-Commands-Run) explains it in full.

## The system tray

Command Center adds a tray icon (on desktops that support one) to show, hide or quit the window. Its tooltip shows running tasks. Closing the window quits the app. Use **Hide window** in the tray menu to keep it running in the background.

---

| | |
|:--|--:|
| [← 📦 Installation](Installation) | [🔍 How Commands Run →](How-Commands-Run) |
