# 🔍 How Commands Run

> _Review, run, watch and stop: how every action works._

Everything in Command Center that changes your system follows the same pattern.

## 1. Review

Clicking an action (Fetch, Review & commit, Run a Toolbox installer, Start a backup…) opens a **review** window with:

- a title and a plain-language explanation,
- the **working directory**,
- the **exact command and arguments** that will run.

**Cancel** runs nothing. **Run action** (or the button's specific wording) starts it. Previews expire after 5 minutes; after that, click the action again.

Just before starting, the app rebuilds the command from your current settings. If anything changed since you opened the review, such as a setting, a path or a branch, it refuses with *"Settings changed; review the action again"* instead of running something different from what you approved.

## 2. Run

Commands run as **your normal user**, never as root. Where a job runs depends on what it needs:

| Mode | Used for | Input | Output |
|---|---|---|---|
| **Background** | Git operations, backups, checks, most tasks | None | Streamed into **Activity** (up to 2 MB per job) |
| **Embedded terminal** | Installers and anything that asks questions | Type in the **Terminal** page, including passwords | Shown on screen only, never saved to Activity |
| **External terminal** | Same, in your own terminal app | In that terminal | Stays in that terminal |

Password prompts (for example from `sudo` inside an installer) come from the command itself and are answered in the terminal. Command Center never asks for or stores your passwords.

## 3. Watch and stop

**Activity** lists every job with its status, exit code and output. Select a running job and click **Stop job** to cancel it. The app stops the command and everything it started.

> [!CAUTION]
> A stopped command may already have made partial changes, so check its output before retrying.

For jobs in an **external terminal**, stop them in that terminal. If you closed the terminal without finishing, use **Terminal closed? Stop monitoring** once you're sure the command has ended.

## Running several jobs

Jobs run at the same time unless they would get in each other's way:

- **Repository jobs** (fetch, pull, push, staging, commits, branches, stashes) and **project tasks** run in parallel as long as they're in **different repositories**.
- **Workstation tasks** are everything else: Toolbox installers, backups and restores, Home Manager, updates, workflows, personal tools and quick actions. They run **one at a time**, but alongside repository jobs.
- Two jobs never run in the **same folder** at once.
- The **embedded terminal** holds one interactive session at a time. External-terminal jobs don't count against it.

If a job has to wait, the app tells you which one it's waiting for, for example *"Wait for "npm · build" to finish. It uses the same folder."* The tray tooltip shows how many jobs are running.

## What runs without asking?

Only **read-only checks**:

- Git status, diffs and history for your repositories. These run with all repository-controlled programs (hooks, filters, external diff tools, signature checks) switched off, so opening or scanning a repository can never run code from it.
- Disk space, failed services and cached package updates.
- Your configured **backup health helper**, which reports backup status. It's the one script you configure that the app runs by itself, so only point it at a script you trust. Imported settings can never change it.
- File and tool presence checks, which look at files but don't execute them.

> [!IMPORTANT]
> Nothing you **import** (settings, setup bundles, workflows) ever runs automatically. Imported commands still go through review each time.

## Closing the app while jobs run

Closing the window is blocked while a job is running. The app takes you to Activity so you can wait or stop the job. If the app or computer crashes mid-job, that job shows as **interrupted** on the next start. Check the command's effects before retrying it.

---

| | |
|:--|--:|
| [← 🏁 Getting Started](Getting-Started) | [📊 Dashboard & Needs Attention →](Dashboard-and-Needs-Attention) |
