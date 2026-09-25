Command Center 0.7.1 is a security release. **All 0.7.0 users should upgrade.**

### Security fixes

- **Viewing a submodule's diff no longer runs that submodule's Git filters.** In 0.7.0, opening the **Unstaged** diff of a staged submodule in Repository Details could make Git inspect the submodule's working files with the submodule's own configuration. A copied or extracted repository with a crafted submodule could therefore run a command when you viewed that diff. Per-file diffs now skip nested submodule working files, as the file list and full diff already did.
- **Recovery notes are read with a size limit.** The recovery notes path comes from Settings or an imported setup bundle. A path such as `/dev/zero` made **Read recovery notes** read until memory ran out. Only regular files are read now, and at most 256 KB.
- **Settings are private to your user.** `settings.json` and `settings.json.bak` were created with default permissions, usually readable by other local users. They can hold your Restic repository address, password-file and KWallet entry names, and custom commands. Both are now written with 0600 permissions, like the app's other private data.
- **REST-server passwords stay off the command line.** Command Center already refused repository URLs with an embedded password, but it missed Restic's `rest:https://user:password@host/` form. That password was passed to restic as an argument, where other local users could read it from the process list, and was saved in Activity. These addresses are now refused too.
- **Hostile Git output can no longer freeze the app.** A Git server could send output that made job-output cleaning take minutes, freezing the window on every launch while the job stayed in Activity. Cleaning is now linear, and displayed output is unchanged.

### Behavior changes

- If your Restic repository is a `rest:` address with a password in it, Restic jobs now stop with an error. Remove the password from the address and set `RESTIC_REST_USERNAME` and `RESTIC_REST_PASSWORD` in the environment Command Center runs in.
- A per-file Unstaged diff of a submodule with local edits no longer shows a `-dirty` marker. Open the submodule directly to inspect its files.
- **Read recovery notes** reports "Recovery notes must be a regular file" for a device, FIFO or folder.
- Existing settings files become private the next time you save settings.

No other features changed. See the [0.7.0 notes](https://github.com/Commanderx-code/command-center/releases/tag/v0.7.0) for backup file history.

### Linux downloads

The `.deb` and `.rpm` assets target **x86_64** and require **glibc 2.35+, GTK 3, WebKitGTK 4.1, and the platform's AppIndicator library**. Notifications additionally use `notify-send`. File restores and file history require Restic 0.17+.

```sh
# Debian / Ubuntu
sudo apt install ./command-center_0.7.1_amd64.deb

# Fedora / RPM
sudo dnf install ./command-center-0.7.1-1.x86_64.rpm

# Arch / Garuda (built against current Arch libraries)
sudo pacman -U ./command-center-0.7.1-1-x86_64.pkg.tar.zst
```

Download `SHA256SUMS` beside the package and run:

```sh
sha256sum --check --ignore-missing SHA256SUMS
```
