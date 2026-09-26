# 🚚 Moving to a New Machine

> _Carry your whole setup to another computer._

A **setup bundle** is a single file with your whole Command Center setup, ready to import on another computer.

## What's in a bundle

✅ Included: preferences, repository scan folders and the list of known repositories, project favorites, groups, launch profiles, tasks and linked services, maintenance workflows, machine profiles, personal tools, quick actions, notification preferences, and Toolbox favorites.

❌ Not included: your repositories' contents, backups, password files, KWallet names, activity history, recovery checksums, the contents of your config files, and remote Restic addresses (they can contain passwords).

> [!WARNING]
> Commands you've saved (quick actions, tasks, tools, workflow inputs) are included **exactly as written**. Look them over for anything private before sharing the file.

## On the old machine: export

1. **Settings → Setup & portability → Export setup bundle…**
2. Read through the preview. It's the complete file.
3. Click **Export bundle**. It's saved to Downloads as `command-center-setup-<number>.json`.

## On the new machine: import

1. Install Command Center, then choose **Import setup bundle…** in Settings (or **Import an existing setup…** in the setup wizard) and pick the file.
2. Check **Home folder on this machine**. Paths from the old machine (`/home/old-name/…` and `~/…`) are rewritten to this home folder. Other paths, URLs and anything inside command text stay as they are, so check them.
3. Choose an **Import method**:
   - **Merge** (the default) keeps everything already on this machine and adds what's new: new workflows, profiles, tools, quick actions and projects, new scan folders and favorites, and integration paths that are empty here. If the bundle has a *different* version of something that already exists, the local one wins, and it's listed under **Already on this machine and kept unchanged**. Your preferences (theme, editor, and so on) aren't changed.
   - **Replace** swaps this machine's saved setup for the bundle's.
4. Review the preview. It's exactly what will be saved. Tick the confirmation box and click **Import setup & reload**.

The app reloads with your setup.

> [!IMPORTANT]
> **Nothing from the bundle runs**: every command still goes through review when you use it.

Repositories that aren't on this machine yet are remembered, not cloned. Add **Clone repository** steps to a [machine profile](Workflows-and-Machine-Profiles#machine-profiles) to fetch them.

These always stay as they are on this machine: your password file, KWallet settings and **backup health helper**. Set those in Settings after importing.

## If something goes wrong

- **Before importing**, the app saves a private backup of the files it will replace (in its data folder, under `setup-backups/`). Settings shows the path after the reload.
- **If writing fails** partway, the files already written are rolled back straight away.
- **If the app or computer stops mid-import**, the next launch automatically restores the previous setup before the window opens, and the dashboard tells you. Import again when you're ready.
- If automatic recovery can't finish, the dashboard explains why and points to the backup file for manual recovery.

Imports are refused while a job is running, if the file isn't a Command Center bundle, if it's over 2 MB, or if your setup changed after you previewed it. In that last case, just preview again.

## Only moving preferences?

**Settings → Export saved settings** / **Import settings…** transfers only preferences and quick actions. See [Settings](Settings#export-and-import-settings).

---

| | |
|:--|--:|
| [← ⚙️ Settings](Settings) | [🔒 Your Data & Privacy →](Your-Data-and-Privacy) |
