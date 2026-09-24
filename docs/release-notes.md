Command Center 0.5.1 is a security release. **All 0.5.0 users should upgrade.**

### Security fixes

- **Repository inspection no longer runs repository-configured programs.** In 0.5.0, opening or scanning a repository could run programs named in that repository's Git configuration (hooks, `core.fsmonitor`, clean/smudge/process filters, external diff or text conversion, signature verifiers, and promisor fetch transports). A copied or extracted repository with a crafted `.git/config` could therefore run commands without review. Automatic status, diff, and history previews now disable all of these. Reviewed Git actions such as staging and committing still use your normal hooks, filters, identity, and signing.
- **Imports can no longer authorize the backup health helper.** The health helper runs automatically for dashboard and backup checks. Setup bundles and settings imports now always keep this machine's configured helper (including an empty value) instead of taking the path from the imported file. Configure it separately in Settings after reviewing the executable.

### Behavior changes

- Files that a content filter normally normalizes may appear changed in previews. Use the repository terminal for a filter-aware comparison.
- Nested submodule working-file changes are omitted from previews; changed submodule commits remain visible. Open a submodule directly to inspect its files.
- Partial clones with missing objects need an explicit fetch in the terminal before inspection.
- Unsupported or oversized filter configuration makes inspection unavailable instead of running it.

No other features changed. See the [0.5.0 notes](https://github.com/Commanderx-code/command-center/releases/tag/v0.5.0) for setup bundles and project workspaces.

### Linux downloads

The `.deb` and `.rpm` assets target **x86_64** and require **glibc 2.39+, GTK 3, WebKitGTK 4.1, and the platform's AppIndicator library**. Notifications additionally use `notify-send`. File restores require Restic 0.17+.

```sh
# Debian / Ubuntu
sudo apt install ./command-center_0.5.1_amd64.deb

# Fedora / RPM
sudo dnf install ./command-center-0.5.1-1.x86_64.rpm
```

Download `SHA256SUMS` beside the package and run:

```sh
sha256sum --check --ignore-missing SHA256SUMS
```

Source installs can update with the exported updater: `bash ~/Downloads/update-desktop.sh v0.5.1`. A local Arch build recipe is included under `packaging/aur/`.
