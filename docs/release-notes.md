Command Center 0.7.0 adds backup file history: find every saved version of a file across your backups and restore the one you want.

### What's new

- **Backup file history:** in **Backup & Restore → File history**, search all Restic snapshots for a file name (for example `notes.md`, matched in any folder), an exact path (`~/Documents/report.odt`), or a pattern (`*.kdbx`), with optional **Ignore case**.
- **See how a file changed over time:** results are grouped by path, newest first. Each saved copy shows when it was backed up, the snapshot and host, and the file's modification time and size, marked **First saved**, **Changed** or **Same as previous**. **Show only versions that changed** hides identical copies.
- **Find deleted files:** if newer snapshots of the same machine and backup path no longer contain a file, the result says it may have been deleted or moved, and when it was last saved.
- **Restore a chosen version:** **Restore this version** fills the restore form with that snapshot and the file's exact path. Pick a new destination folder and review. Restores still never overwrite existing files and are verified as they're written.
- **Wiki user guide:** a step-by-step guide to every page and feature, now linked from the README: https://github.com/Commanderx-code/command-center/wiki

### Behavior to know

- Searching is a reviewed, read-only job. It lists snapshots, then searches all of them, so it can take a while on large repositories and may ask KWallet to unlock. Nothing is restored until you review a restore.
- "Changed" compares size and modification time between copies. It doesn't compare file contents.
- A search matching a huge number of files can't be displayed. Search a more specific path instead.
- Restic treats `*`, `?` and `[` in paths as pattern characters. For file names containing them, check the include path before restoring.

### Linux downloads

The `.deb` and `.rpm` assets target **x86_64** and require **glibc 2.35+, GTK 3, WebKitGTK 4.1, and the platform's AppIndicator library**. Notifications additionally use `notify-send`. File restores and file history require Restic 0.17+.

```sh
# Debian / Ubuntu
sudo apt install ./command-center_0.7.0_amd64.deb

# Fedora / RPM
sudo dnf install ./command-center-0.7.0-1.x86_64.rpm

# Arch / Garuda (built against current Arch libraries)
sudo pacman -U ./command-center-0.7.0-1-x86_64.pkg.tar.zst
```

Download `SHA256SUMS` beside the package and run:

```sh
sha256sum --check --ignore-missing SHA256SUMS
```
