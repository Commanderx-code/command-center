# 📊 Dashboard & Needs Attention

> _Your home screen, quick actions, and everything waiting for you._

## Dashboard

The dashboard is your home screen (you can choose a different start page in **Settings → General**). It shows:

- **Status cards** for repositories, configuration, backups and system health, so you can see what's clean, what's changed, and what's overdue.
- **Quick actions** launchpad: **Refresh repos** re-reads every repository's status; **Run backup**, **Home Manager** and **Edit configs** open Backup & Restore, System Sync and Configuration.
- **Your quick actions:** your own buttons for commands you use often, such as `full-upgrade`, a backup or a build script. Each click still shows the command for review first.
- A **Make this machine yours** prompt until you've finished the setup wizard.
- Notices about setup imports, including an interrupted import that was rolled back (see [Moving to a New Machine](Moving-to-a-New-Machine)).

### Adding quick actions

Go to **Settings → Custom quick actions → Add action** (up to 20):

| Field | Meaning |
|---|---|
| Name | The button label |
| Command | What to run |
| Working folder | Where it runs, for example `~` |
| Shell | **Direct** runs the program with its arguments and no shell tricks. **Fish** or **Bash** load your interactive shell setup, so your functions and aliases work. |
| Mode | **Background** (output in Activity, no input), **Embedded** (built-in terminal, can answer prompts) or **External** (your terminal app) |

Example: a Fish action with command `full-upgrade`, working folder `~` and mode **Embedded** runs your upgrade function in the built-in terminal, where you can type your password.

> [!WARNING]
> Commands are saved and shown in Activity as written, so don't put passwords in them.

## Needs attention

**Needs attention** gathers everything that wants action into one list:

- Repositories with **uncommitted changes**, **unpushed commits**, or that are **behind** their remote
- **Failed jobs** you haven't reviewed yet (open them in Activity and click **Mark reviewed** once handled)
- **Backups** that are overdue or whose status is unavailable
- **Disks** at least 90% full
- **Failed services**

Each item links to the page where you can deal with it. The sidebar badge shows how many items there are.

> [!TIP]
> "Behind" and "ahead" counts come from your last **fetch**. Fetch a repository to refresh them.

---

| | |
|:--|--:|
| [← 🔍 How Commands Run](How-Commands-Run) | [📂 Repositories →](Repositories) |
