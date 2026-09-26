# 🛠️ Development

<sub>[🏠 README](../README.md) &nbsp;·&nbsp; [📚 Docs](README.md) &nbsp;·&nbsp; [📦 Installation](installation.md) &nbsp;·&nbsp; [🤝 Contributing](../CONTRIBUTING.md)</sub>

> _Architecture, checks, Toolbox updates, packaging, and docs._

## Architecture

Command Center uses a JavaScript frontend inside a Tauri 2 webview. Rust commands handle filesystem access, Git, process execution, configuration, backups, and system integrations. esbuild bundles the frontend. xterm.js renders interactive terminal sessions backed by portable-pty.

| Path                        | Purpose                                                                     |
| --------------------------- | --------------------------------------------------------------------------- |
| `index.html`                | Application shell and main views.                                           |
| `src/`                      | Frontend views, state, configuration controls, styles, and terminal UI.     |
| `src-tauri/src/`            | Rust commands, integrations, repository operations, jobs, and PTY sessions. |
| `src-tauri/tauri.conf.json` | Desktop window, security policy, and package configuration.                 |
| `scripts/`                  | Frontend build, preview server, checks, and per-user installer.             |
| `tests/`                    | JavaScript model and simulated-interface tests.                             |
| `packaging/`                | Linux desktop entry.                                                        |
| `docs/`                     | Installation, user documentation, and historical development notes.         |

See [Installation](installation.md#from-source-on-archgaruda) for the build prerequisites. Use `npm ci` to install the locked JavaScript dependencies. No sibling Toolbox checkout is needed.

## Checks

Run these from the repository root:

```bash
npm run check
npm test
npm run test:rust
npm run build
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

The JavaScript suite covers preference migration, project filters, configuration editing, backup result parsing, and interface flows through a simulated desktop bridge.

Rust tests exercise temporary Git remotes, fast-forward and divergence behavior, process cancellation and timeouts, Unicode output, private atomic persistence, setup remapping/redaction/import rollback, read-only project task detection, configuration backups and conflicts, catalog completeness, compatibility rejection, and PTY input, resizing, and cancellation. Restic integration tests use a temporary encrypted repository when Restic is installed.

The **Security audit** workflow runs `cargo audit --file src-tauri/Cargo.lock` and `npm audit` on every pull request, every push to main, and weekly, so new advisories against unchanged dependencies are caught too. Run them locally before changing dependencies (`cargo install cargo-audit --locked` once). A known vulnerability fails the check; RustSec "unmaintained" and "unsound" notices are warnings.

Workflow actions are pinned to full commit SHAs, with the version in a trailing comment. Dependabot (`.github/dependabot.yml`) opens grouped weekly updates for Actions, npm, and Cargo; review an Action update's release before merging it. The Commander Toolbox pin is excluded; update it with `scripts/pin-toolbox.mjs`.

> [!NOTE]
> Tests do not push real repositories, run personal backups, activate Home Manager, or execute real Toolbox installers. UI changes should also be checked visually in the browser preview and, for native behavior, in the desktop app.

## Updating Commander Toolbox

The app links to `linutil_core` at a pinned Git revision. Its embedded script tree, relative imports, interpreter selection, and preconditions are shared with the TUI. A worker keeps the extracted tree alive for the lifetime of the app.

1. Update the `linutil_core` revision in `src-tauri/Cargo.toml` and the reported revision in `src-tauri/src/toolbox.rs` together.
2. Refresh `src-tauri/Cargo.lock` with Cargo.
3. Update the revision documented in the [user guide](user-guide.md#toolbox-integration) and [third-party notices](../THIRD_PARTY.md).
4. Run the checks above and inspect the catalog in the desktop app.
5. Rebuild the application and packages.

Compatibility is checked during review and again before execution. The catalog is bundled with the binary; individual scripts may download their normal dependencies. Updating the app changes its bundled installer sources. Applying those configurations still requires running the relevant installer.

## Packaging

```bash
npm run desktop:package
```

Tauri writes `.deb` and `.rpm` packages under `src-tauri/target/release/bundle/`. Keep versions aligned in `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, and `src-tauri/tauri.conf.json` when preparing a version bump.

> [!IMPORTANT]
> Release packages come from CI, which builds on Ubuntu 22.04 and declares a glibc 2.35 floor. A local `desktop:package` build on a newer distribution links against its newer glibc, so `scripts/verify-packages.py` correctly rejects it as a release candidate. See [Releases](releases.md#package-validation-and-distribution-ci).

## Wiki

The [GitHub wiki](https://github.com/Commanderx-code/command-center/wiki) is published from `docs/wiki/`. Edit the pages there and open a pull request; after it merges, the `Publish wiki` workflow copies them to the wiki.

> [!WARNING]
> Edits made directly in the wiki are overwritten the next time that page changes here.

Page links use wiki names such as `[Settings](Settings)`, so they only resolve on the wiki itself. `Home.md`, `_Sidebar.md`, and `_Footer.md` are the landing page, sidebar, and footer.

## Documentation screenshots

The README screenshot is captured from the actual browser preview with sample data. Keep the preview notice visible and avoid publishing personal repository contents, credentials, or terminal transcripts. Refresh `docs/images/dashboard.jpg` when the dashboard changes materially.
