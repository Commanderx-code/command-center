Command Center 0.5.0 adds portable workstation setups and project workspaces.

### What's new

- **Setup bundles:** export saved preferences, repository paths and workspace profiles, workflows, machine profiles, personal tools, and Toolbox favorites together. Preview imports, remap home-directory paths, and keep a private backup before replacing saved definitions. Importing starts no commands.
- **Setup wizard:** connect existing Commander-os/Home Manager and Restic helpers through editable drafts, check local prerequisites, inspect a machine profile, then review and save.
- **Project workspaces:** save per-repository build/test/dev tasks, discover npm and Cargo task suggestions without executing scripts, and link services for status/log inspection. Every task uses command review and Activity; embedded tasks open in Terminal.
- **Keyboard access:** skip to main content, navigate primary pages with arrow keys/Home/End, and use clearer focus and active-page semantics. OS reduced-motion preferences are respected.

Existing workflow, Toolbox, backup, Git, configuration, notification, and tray features remain available. See the [setup and workspace guide](https://github.com/Commanderx-code/command-center/blob/v0.5.0/docs/setup-and-workspaces.md).

### Linux downloads

The `.deb` and `.rpm` assets target **x86_64** and require **glibc 2.39+, GTK 3, WebKitGTK 4.1, and the platform's AppIndicator library**. Notifications additionally use `notify-send`. File restores require Restic 0.17+.

```sh
# Debian / Ubuntu
sudo apt install ./command-center_0.5.0_amd64.deb

# Fedora / RPM
sudo dnf install ./command-center-0.5.0-1.x86_64.rpm
```

Download `SHA256SUMS` beside the package and run:

```sh
sha256sum --check --ignore-missing SHA256SUMS
```

A local Arch build recipe is included under `packaging/aur/`; it has not been submitted to AUR or validated in a clean Arch chroot.

### Behavior to know

Setup imports replace the reviewed saved collections rather than merging them. Credential files, wallet identifiers, file contents, activity logs, and recovery baselines are excluded; saved command text is included and should be inspected before sharing. Structured paths are remapped, but command text and arbitrary input values are unchanged. Existing local credential connections are retained. Missing repositories are remembered for scanning, not cloned automatically.

A running job blocks import. Previous data is backed up before replacement and ordinary write failures are rolled back; recovery after a crash during the multi-file import may require restoring that backup manually. Machine profiles operate locally, and each command still requires review. The existing one-running-job limit also applies to project tasks.
