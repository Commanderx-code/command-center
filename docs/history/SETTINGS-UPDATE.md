> [!WARNING]
> **Historical development notes.** These describe an earlier version and may no longer match the app. See the [current user guide](../user-guide.md) for supported behavior.

# Basic settings update

Open Settings in the sidebar. Choose a display name, startup page, editor,
terminal, accent color, repository density, reduced motion, scan depth,
refresh interval, and scan folders. Save settings applies the draft; Discard
reverts it. Reset fills the draft with defaults and requires Save to apply.

Desktop settings are stored in Tauri's app configuration directory as
settings.json (normally ~/.config/io.helixstack.commandcenter/settings.json on
Linux). The previous settings file is retained as settings.json.bak on save.
Existing scan roots migrate from the old frontend storage on first launch.
Browser previews store their own settings in browser local storage and show
sample repositories. They cannot launch applications or scan your filesystem.

Application choices affect Command Center only. Apps must be installed first.
System default preserves the previous VISUAL / EDITOR and terminal detection.
Selecting Neovim launches it inside the selected terminal. The corrected Ghostty
working-directory argument is included. Other platforms are not implemented.

Repository roots are canonicalized to remove duplicates caused by symlinks.
Separate clones and separate Git worktrees remain separate. Depth is measured
in folder levels beneath the scan root. Missing roots are skipped. Automatic
refresh reads local Git state while the app is visible; it does not fetch,
pull, push, commit, or modify repositories. Dependency/build directories are
excluded from traversal. Backup, health, and Home Manager remain unconnected.

Validation: JavaScript syntax, preference normalization/migration, production
frontend build, and updater apply/repeat/conflict behavior are checked locally.
Rust compilation and real desktop launching must be checked on your machine.
Run `cargo test --manifest-path src-tauri/Cargo.toml` to exercise the included
Rust preference validation and launcher argument tests.
