# 🧰 Toolbox & Terminal

> _215 Commander Toolbox installers, your own tools, and the built-in terminal._

**Toolbox** brings the [Commander Toolbox](https://github.com/Commanderx-code/commander-toolbox) installers into the app: 215 actions across **Applications Setup**, **Gaming**, **Security**, **System Setup** and **Utilities**. They're the same scripts, folders and menus as the terminal version, with a graphical browser on top.

## Finding a tool

- Open a category, then its sub-folders. Use the breadcrumbs or **Up** to go back.
- **Search** within the current folder (and everything inside it). Choose **All tools** to search the whole catalog.
- **★ Favorites** shows only the tools you've starred. Star a tool with the **★** button on its detail panel. Favorites are saved with your app data and included in [setup bundles](Moving-to-a-New-Machine).
- **Available on this machine** hides tools whose requirements aren't met (wrong distribution, missing interpreter…). Untick it to see everything.
- From a search result, **Open containing folder** jumps to the tool's menu.

Selecting a tool shows its description, what kind of task it is (installation, file changes, package manager…), whether it's available, and when you last ran it.

## Quick setup

Expand **Quick setup** for the most common jobs. Choose **What are you setting up?** (a **Myfish** shell, a **dotfiles** configuration, or an **application**), then **Choose a setup**, and the app opens that tool ready to run.

## Running a tool

1. Choose **Run tools in**: the **embedded** terminal (inside the app) or **external** (the terminal app chosen in Settings).
2. Click **Review & run**. The review shows the exact script and folder.
3. Confirm. Installer questions, menus and `sudo` password prompts appear in the terminal exactly as they would in the terminal version, and you answer them there.

> [!NOTE]
> The app checks compatibility again just before starting. Toolbox scripts keep their own safety checks and confirmations.

## The Terminal page

The **Terminal** page is a real terminal session for the running installer or task:

- Type, answer prompts and use arrow-key menus as usual. It resizes with the window.
- **Stop workflow** cancels the running command.
- **Save output** writes the session to a private file in the app's data folder. Otherwise output is kept only in memory (up to 1 MB) and disappears when you close the app. What you type, including passwords, is never recorded.
- Only one embedded session runs at a time. For image graphics or a second session, use an **external** terminal.

Return to a session from the **Terminal** page or its entry in **Activity**.

## Personal tools

Add your own tools alongside the catalog: scroll to **Personal tools** at the bottom of Toolbox and click **Add personal tool**.

| Field | Meaning |
|---|---|
| Name, description | How it appears in the list |
| Folder | Where it sits, for example `Maintenance/Backups` (nested folders work) |
| Command | The program and arguments |
| Working folder | Where it runs |
| Required executable | A program that must be installed (checked, not installed for you) |
| Run in | Embedded, External or Background |
| Inputs | Values to ask for each time (text, a folder, or a Git repository folder) |

**Inputs** let one tool work on whatever you choose. Put a placeholder as a whole argument, for example:

```text
git -C {repo} status
```

Add an input named `repo` of type **Repository folder**. When you run the tool, the app asks you to pick a repository, checks it, and shows the finished command for review. Values are passed exactly as typed, with no shell expansion. For pipes or shell functions, point the tool at a script or use a Fish/Bash [quick action](Dashboard-and-Needs-Attention#adding-quick-actions).

## Toolbox Updates

Expand **Toolbox Updates** at the top of Toolbox. Checking never installs anything.

- **Check catalog updates** compares the bundled Toolbox version with the latest on GitHub and links to the differences. The catalog is built into the app, so taking a newer one means rebuilding it. The panel shows the command for source installs; package users get it with the next release.
- **Check installed-tool updates** lists pending updates by source: Arch packages (using a fresh check where possible, clearly marked if it's the cached list), Flatpak (user and system), and AUR/foreign packages (listed, not checked).
- **Review & update** runs the updater you choose: your Fish `full-upgrade` function, Topgrade, Garuda's updater, a plain Arch update, or Flatpak. It runs in a terminal with the normal prompts. Pick one broad updater or individual ones, not both, so updates don't run twice.

---

| | |
|:--|--:|
| [← 📂 Repositories](Repositories) | [🔁 Workflows & Machine Profiles →](Workflows-and-Machine-Profiles) |
