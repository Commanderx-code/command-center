# 🕒 Activity & Change Timeline

> _What ran, what it printed, and what changed._

## Activity

**Activity** is the history of every command Command Center has run: the last **100 jobs**, kept across restarts. The sidebar badge shows how many are running right now.

Select a job to see:

- its title, **status** (running, succeeded, failed, cancelled, timed out or interrupted), start and finish times, and **exit code**,
- the exact **command** and folder it ran in,
- its **output** (for background jobs, up to 2 MB per job; anything cut off is marked clearly).

Actions on a job:

| Button | When |
|---|---|
| **Stop job** | A background or embedded-terminal job is running. It stops the command and everything it started |
| **Terminal closed? Stop monitoring** | An external-terminal job whose terminal you've closed. Use it only once you're sure the command has ended |
| **Mark reviewed** | A failed job you've dealt with. It then leaves [Needs attention](Dashboard-and-Needs-Attention#needs-attention) |

Interactive sessions (installers in the Terminal) record their result here, but not what was typed or shown. That stays in the terminal. See [How Commands Run](How-Commands-Run) for how jobs run, run side by side, and stop.

If the app crashes or the computer shuts down during a job, that job is marked **interrupted** on the next start. Check what the command did before running it again.

## Change timeline

**Change timeline** answers *"what changed before this stopped working?"* It merges:

- jobs from Activity: package updates, Git operations, backups, service actions, workflow and profile steps, and so on,
- configuration saves from the [Configuration](Configuration) page (each save keeps a backup of the previous file).

**Search timeline** by title, result, category or folder, and filter with **All categories** or one category. **Refresh timeline** reloads it.

A configuration entry means the file was saved (and the old one backed up). It doesn't mean the change was activated. For Home Manager-managed files, that happens when you apply Home Manager.

> [!NOTE]
> The timeline only knows about changes made **through Command Center**. Changes from other apps or the command line don't appear.

---

| | |
|:--|--:|
| [← 🩺 Health, Services & Inventory](Health-Services-and-Inventory) | [⚙️ Settings →](Settings) |
