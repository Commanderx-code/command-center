# Releases and updates

## Installing a published release

Open Settings → About & updates. Check for releases, read the notes, then export the source updater. Close Command Center and run the displayed command, for example:

```sh
bash ~/Downloads/update-desktop.sh v0.7.0
```

The helper requires Linux build dependencies, Git, Node/npm, and Rust/Cargo. Run as your normal user, without sudo. It asks you to type the tag, downloads that tag into a temporary checkout, checks its package version, installs dependencies, runs JavaScript and Rust tests, then builds and installs the desktop app. A failed check stops installation. It does not modify your project checkout or app settings. The GitHub tag must already exist; the release checker only advertises published stable releases. Offline/API errors are shown without claiming that the installed version is current. GitHub is contacted only when you request a release check or open its release page.

The local installer preserves `~/.local/bin/command-center.previous`. To roll back the binary, close the app and run:

```sh
cp -- ~/.local/bin/command-center.previous ~/.local/bin/command-center.rollback
chmod +x ~/.local/bin/command-center.rollback
mv -- ~/.local/bin/command-center.rollback ~/.local/bin/command-center
```

This rolls back the binary only, not settings or user data. It applies to the normal local installation, not package-manager installations. No automatic package-manager upgrade, signature verification, or background download is provided.

## Preparing a release as maintainer

Keep package.json, package-lock.json, Cargo.toml, Cargo.lock, and tauri.conf.json versions aligned. Update docs/release-notes.md and CHANGELOG.md. Commit and push the reviewed source, then create and push an annotated tag matching the version:

```sh
git tag -a v0.7.0 -m 'Command Center v0.7.0'
git push origin v0.7.0
npm run release:draft -- v0.7.0
```

The draft command requires an authenticated GitHub CLI (`gh`). It checks for a clean working tree and a matching local/remote tag and runs the checks and tests. It then finds the successful **Linux packages** run for the tagged commit, downloads that run's `packages` and `arch-package` artifacts, verifies their checksums, writes one `SHA256SUMS` covering the `.deb`, `.rpm`, and Arch package, and creates an **unpublished** GitHub release. The release notes are docs/release-notes.md plus a build-and-validation section linking the workflow run. If CI has not passed for the tag, no draft is created. The command never builds release packages locally: a build on a newer distribution such as Garuda would require a newer glibc than the packages declare. It does not push tags or publish the draft. Download and verify the hosted assets and test the app on your machine before publishing.

The app discovers only published releases. Building a package, creating a tag, or preparing a draft does not publish a release.

## Package validation and distribution CI

The **Linux packages** workflow runs these jobs:

| Job           | What it does                                                                                                                                         |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests`       | JavaScript and Rust tests and clippy as a normal user on Ubuntu 24.04.                                                                               |
| `build`       | Builds the `.deb` and `.rpm` once in an `ubuntu:22.04` container (glibc 2.35), validates them, and uploads the `packages` artifact with `SHA256SUMS`. |
| `install-deb` | Installs that `.deb` on Ubuntu 22.04, Debian 12, and Ubuntu 24.04 and runs a 20-second launch check under a virtual display as an ordinary user.      |
| `install-rpm` | Installs that `.rpm` on Fedora 43 and runs the same launch check.                                                                                    |
| `arch`        | Builds `packaging/aur/PKGBUILD` in a clean `archlinux` container, lints the recipe and package with namcap, installs, and launches it. Tag pushes build the recipe unmodified from its release tag (the pkgver must match the tag) and upload the `arch-package` artifact; other pushes build the pushed commit. |

These are installation and launch checks, not end-to-end validation of system-changing workflows.

`scripts/verify-packages.py` checks package metadata and payloads, then compares the glibc floor declared in `tauri.conf.json` with the highest glibc symbol version the binary actually requires. It fails if the binary needs a newer glibc than the packages declare. It then stages named assets and checksums in `artifacts/release/`. To raise or lower the floor, change the build container and both `depends` entries together.

## Arch User Repository

`packaging/aur/PKGBUILD` builds the release tag, and `packaging/aur/.SRCINFO` is generated from it. CI validates the recipe on every push. To publish or update the AUR package:

1. After the release tag is published and the `arch` job passed for it, bump `pkgver` (and reset `pkgrel=1`) if not done already, then regenerate the metadata: `cd packaging/aur && makepkg --printsrcinfo > .SRCINFO`.
2. Clone the AUR repository with an account that has an SSH key registered on aur.archlinux.org: `git clone ssh://aur@aur.archlinux.org/command-center.git`. For the first upload this creates the package.
3. Copy `PKGBUILD` and `.SRCINFO` into that clone, commit, and push.

The recipe declares the project's MIT license and installs `LICENSE` under `/usr/share/licenses/command-center/`. Add a `# Maintainer: Name <email>` line at the top of `PKGBUILD` before the first AUR upload.
