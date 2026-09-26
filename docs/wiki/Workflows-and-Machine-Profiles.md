# 🔁 Workflows & Machine Profiles

> _Repeatable maintenance routines and new-machine recipes._

The **Workflows** page saves routines you repeat, so you don't have to remember the order:

- **Maintenance workflows**, such as "check the backup drive → back up → check the repository → check services and disks".
- **Machine profiles**, which are setup recipes for a workstation, laptop or fresh install.

> [!IMPORTANT]
> Both are built from the same kinds of steps, and **every step is still reviewed before it runs**.

## Step types

| Step | What it does |
|---|---|
| Check backup drive | Confirms the backup health helper reports the drive connected |
| Run personal backup | Runs your personal backup helper |
| Check Restic repository | Checks the Restic repository's integrity |
| Build Home Manager / Apply Home Manager | Builds, then switches to, your Home Manager configuration |
| Fetch dotfiles / Pull dotfiles | Updates your dotfiles checkout |
| Fetch repository | Fetches a chosen repository |
| Clone repository | Clones a repository into a new folder (useful in machine profiles) |
| Run Toolbox installer | Runs a Toolbox tool |
| Run saved quick action | Runs one of your [quick actions](Dashboard-and-Needs-Attention#adding-quick-actions) |
| Run personal tool | Runs one of your [personal tools](Toolbox-and-Terminal#personal-tools) |
| Update packages | Runs a system updater |
| Check services and disk usage | Reports disk usage and failed services |

## Creating a workflow

1. Click **New workflow** (or **Add weekly maintenance example** for a ready-made starting point).
2. Name it, then **Add step** for each step. Reorder with the up buttons, remove what you don't need.
3. **Save recipe**.

The weekly maintenance example is: Check backup drive → Run personal backup → Check Restic repository → Check services and disk usage. Add an **Update packages** step if you want updates in the same routine.

## Running a workflow

1. Click **Start workflow**. A progress panel lists every step.
2. Click **Review next step**, check the command, and confirm.
3. When a step succeeds, the next one becomes available. Nothing moves on by itself.

A failure, cancellation or timeout **stops the sequence**. Look at the step's output in Activity, then use **Review retry of current step** to try again. A failed command may have partly run, so check first. **Stop sequence** prevents further steps; to stop the step that's running now, use Activity or its terminal.

Interactive steps open in the terminal so you can answer prompts. Workflow steps are workstation tasks, so only one runs at a time. Repository jobs in other folders can still run alongside (see [How Commands Run](How-Commands-Run#running-several-jobs)). If the app closes mid-workflow, the sequence shows as **interrupted** and waits for you to review it.

## Machine profiles

A machine profile describes how to set up a machine: which repositories to clone, which Toolbox installers to run, and which configuration to apply.

1. Click **New machine profile** and add steps, as with a workflow.
2. Optionally set **Dotfiles checkout for this machine** and **Home Manager profile**. Leave them blank to use the ones in Settings.
3. For steps that might already be done, fill in **Optional presence check** with a path. If that file or folder exists, the step is marked **Present · inspect before skipping**.

**Review profile** shows, for the current machine, which steps are ready to run and which need setup first. You can **Skip inspected step** (with confirmation) for things already in place. The app never skips anything by itself, because a file being present doesn't prove it's the right version.

Profiles run on **this** computer only. Clone targets must be new folders; nothing is overwritten. Toolbox installers still ask their own questions. The setup wizard can inspect a profile, and [setup bundles](Moving-to-a-New-Machine) carry your profiles to the new machine.

---

| | |
|:--|--:|
| [← 🧰 Toolbox & Terminal](Toolbox-and-Terminal) | [🗄️ Backup & Restore →](Backup-and-Restore) |
