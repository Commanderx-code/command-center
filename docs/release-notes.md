Command Center 0.6.0 makes setup imports safer, runs independent jobs side by side, and brings the packages to older distributions.

### What's new

- **Merge setup imports:** choose **Merge** (the default) to keep this machine's preferences and saved definitions and add the bundle's new workflows, machine profiles, personal tools, quick actions, workspace profiles, scan folders, and Toolbox favorites. Empty integration paths are filled; different items whose IDs already exist here are kept and listed in the preview. **Replace** works as before.
- **Interrupted imports recover automatically:** imports now keep a journal. If the app or computer stops mid-import, the next launch restores every file from the pre-import backup before the interface opens and tells you on the dashboard.
- **Run several jobs:** repository actions and project tasks in different repositories run at the same time, alongside one workstation task such as a backup, installer, or Home Manager switch. Jobs in the same folder, and embedded-terminal sessions, still take turns; a waiting job names the job it is waiting for. Stop each job from Activity.
- **Wider distribution support:** packages now require glibc 2.35+ instead of 2.39, adding Ubuntu 22.04 and Debian 12. Every package is install- and launch-tested on Ubuntu 22.04, Debian 12, Ubuntu 24.04, and Fedora 43, and the Arch recipe is built, linted, and launched in a clean Arch container.
- **MIT licensed:** Command Center is now released under the MIT License. The `.deb`, `.rpm`, and Arch packages include the license and the bundled third-party notices.
- **Favorites saved with your data:** Toolbox favorites move from webview storage into the app's data folder on first launch and are included transactionally in setup imports.

### Behavior to know

- Merge never changes preferences such as theme, editor, or terminal, and never replaces a non-empty integration path. Use **Replace** to adopt another machine's setup wholesale.
- The backup health helper, password-file, and wallet settings always stay local, as in 0.5.1.
- Automatic recovery only restores the files an import writes. If it cannot finish, the dashboard shows the reason and the manual steps in the [setup guide](https://github.com/Commanderx-code/command-center/blob/v0.6.0/docs/setup-and-workspaces.md).
- Two jobs never share a working directory, so a project task and a Git action in the same repository still run one after the other.

### Linux downloads

The `.deb` and `.rpm` assets target **x86_64** and require **glibc 2.35+, GTK 3, WebKitGTK 4.1, and the platform's AppIndicator library**. Notifications additionally use `notify-send`. File restores require Restic 0.17+.

```sh
# Debian / Ubuntu
sudo apt install ./command-center_0.6.0_amd64.deb

# Fedora / RPM
sudo dnf install ./command-center-0.6.0-1.x86_64.rpm
```

Download `SHA256SUMS` beside the package and run:

```sh
sha256sum --check --ignore-missing SHA256SUMS
```

Arch users can build `packaging/aur/PKGBUILD` with `makepkg -si`.
