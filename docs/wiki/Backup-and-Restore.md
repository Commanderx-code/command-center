# 🗄️ Backup & Restore

> _Backups, snapshots, file history, restores, schedules and recovery tests._

**Backup & Restore** works with the backup setup you already have: your own backup scripts plus a [Restic](https://restic.net) repository. It runs your scripts, lets you browse and restore from snapshots, finds every saved version of a file, schedules backups, and can prove a restore actually works.

Before you start, connect your helpers and repository in **Settings → System integrations** (see [Getting Started](Getting-Started#2-finish-connecting-your-setup)).

## Backup overview and readiness

The top of the page shows:

- **Where backups go** and whether the drive is connected, as reported by your **backup health helper**. If there's no report, the status shows as **unknown**, which doesn't mean disconnected.
- **When the last successful backup finished**, and whether it's overdue (the limit is set in Settings as *Backup freshness*).
- **Backup readiness**: whether your helpers exist and are executable, whether Restic is installed, and where credentials come from (KWallet, a password file or the environment). "Configured" isn't the same as "works". Use **Test repository access** to confirm that.

Click **Refresh health** after plugging in a backup drive.

## Running a backup

- **Personal backup** runs your personal backup helper in the background. Output goes to Activity.
- **Full recovery backup** runs your full backup helper in a **terminal**, so it can ask for encryption passwords.

Both buttons are disabled if the helper isn't set up, or if the health helper reports your backup drive disconnected. The app checks again when the job starts, and your scripts keep their own checks.

## Checking the repository

- **Test repository access** unlocks the repository with your configured credentials (this may prompt KWallet) and reads its configuration. Success means access works right now.
- **Check repository** runs Restic's integrity check on the repository's metadata.

> [!TIP]
> Neither one proves that every file can be restored. For that, use [Recovery verification](#recovery-verification).

## Browsing snapshots

1. Click **Load snapshots** to list the latest 30.
2. Pick one and **Browse** its folders in the **Snapshot browser**.

## Restoring files

1. Choose the **Selected snapshot**.
2. Optionally set **Include path or pattern** to restore only some files, for example `/home/you/Documents/taxes`. Leave it blank to restore the whole snapshot.
3. Enter a **New destination folder** inside your home folder. It must not exist yet; its parent must.
4. Click **Review restore** and confirm.

> [!NOTE]
> Restores **never overwrite** anything: files go into the new folder and are verified as they're written. Copy what you need back into place yourself. This recovers files; it isn't a full system or disk-image restore.

## File history

> [!NOTE]
> **New in 0.7.0**

Deleted a file, or need yesterday's version? **File history** searches **every** snapshot for it:

1. Type what you're looking for:
   - a **name** such as `notes.md`, which matches it in any folder,
   - an **exact path** such as `~/Documents/report.odt`, or
   - a **pattern** with `*` and `?`, such as `*.kdbx`.
2. Tick **Ignore case** if you're not sure of the capitalization, then click **Search backups**. The review shows the exact Restic commands. The search only reads, but it goes through every snapshot, so large repositories can take a while.
3. Results are grouped by file path, newest first. Each saved copy shows:
   - when it was backed up, with the snapshot ID and computer,
   - the file's **modified** time and **size**,
   - **First saved**, **Changed** (different size or modified time from the copy before) or **Same as previous**.

   **Show only versions that changed** (on by default) hides the identical copies, so you see just the real versions.
4. Click **Restore this version** on the one you want. The restore form below fills in that snapshot and the file's exact path. Enter a **New destination folder** and click **Review restore**.

If a file is missing from newer backups of the same computer and folder, you'll see *"Not in the N newer snapshots… It may have been deleted or moved"*. The last row shows the final saved copy, ready to restore.

Good to know:

- "Changed" compares size and modified time, not the file contents.
- If a search matches thousands of files, it can't be shown. Search a more specific path.
- Restic reads `*`, `?` and `[` as pattern characters, so for a file whose name contains them, check the **Include path or pattern** before restoring.

## Backup schedules & user timers

This section lists your user **timers** (up to 100) with their next and last run, whether they're enabled, and the result of the service each one starts. **Enable** / **Disable** turn a timer on or off. **Service logs** shows the output of its last runs.

### Scheduling automatic backups

Under **Create or edit Command Center's backup schedule**, choose **hourly**, **daily** or **weekly (Sunday)** and a time, then **Review & save schedule**. The review shows the exact systemd timer and service files before anything is written.

- It runs your **personal** backup helper, which must work unattended (no password prompts).
- Missed runs, for example while the computer was off, happen the next time your session starts.
- The app only writes its own two files (`command-center-backup.service` and `.timer`) and refuses to touch anything else. It keeps a `.bak` copy when changing its own schedule.
- If you already have another backup timer, disable one so backups don't run twice.
- Timers run while you're logged in. They don't wake a sleeping or powered-off computer.

## Recovery verification

A backup you've never restored from is a guess. Recovery verification proves one file comes back intact:

1. Pick a small file (up to 100 MB) in your home folder that doesn't change often. In **Recovery verification**, choose it as the **Recorded file** and click **Record checksum**.
2. Run your normal backup so that exact version is in a snapshot.
3. **Load snapshots** and copy the new snapshot's ID into **Snapshot ID**.
4. Select the recorded baseline and click **Review recovery test**.

The app restores just that file into a temporary folder, compares its checksum with the recorded one, and deletes the temporary copy. Your original file is never touched. The result shows under recent recovery results and in Activity.

A pass proves that file can be recovered from that snapshot with your current credentials. It doesn't certify every file or every snapshot. If you edit the file later, record a new checksum.

---

| | |
|:--|--:|
| [← 🔁 Workflows & Machine Profiles](Workflows-and-Machine-Profiles) | [🔄 System Sync →](System-Sync) |
