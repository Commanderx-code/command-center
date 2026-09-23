# Releases and updates

## Installing a published release

Open Settings → About & updates. Check for releases, read the notes, then export the source updater. Close Command Center and run the displayed command, for example:

```sh
bash ~/Downloads/update-desktop.sh v0.5.0
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
git tag -a v0.5.0 -m 'Command Center v0.5.0'
git push origin v0.5.0
npm run release:draft -- v0.5.0
```

The draft command requires an authenticated GitHub CLI (`gh`). It checks for a clean working tree and a matching local/remote tag, runs checks, tests, and the package build, then creates an **unpublished** GitHub release using docs/release-notes.md. It attaches validated `.deb` and `.rpm` packages plus `SHA256SUMS`. It does not push tags or publish the draft. Review and publish on GitHub after testing the app on your machine. GitHub supplies source archives automatically; this workflow does not claim that a build on Garuda is portable across Linux distributions.

The app discovers only published releases. Building a package, creating a tag, or preparing a draft does not publish a release.

## Package validation and distribution CI

The **Linux packages** workflow builds on Ubuntu 24.04 and Fedora 43, validates package metadata and ELF payloads, installs the matching package, and runs a 20-second launch check under a virtual display as an ordinary user. Artifacts are retained by GitHub Actions. This is an installation/launch check, not an end-to-end validation of system-changing workflows.

Run `python3 scripts/verify-packages.py` after a local package build to stage named assets and checksums in `artifacts/release/`. Release binaries must have runtime requirements compatible with their declared dependency floor. Hosted release downloads should be downloaded and verified before publication.

For distribution-tested release assets, download the artifacts from a successful **Linux packages** run for the exact release commit. Use the `.deb` from `ubuntu-packages` and the `.rpm` from `fedora-packages`, verify each artifact's checksums, and generate a new `SHA256SUMS` for that selected pair. Attach them to a draft release, download and verify the hosted assets, then publish. Record the workflow URL and validation results in the release notes.

`packaging/aur/PKGBUILD` is a local Arch build recipe pinned to the release tag. Run `makepkg -si` from a copy of that directory after the tag is published. This recipe has not been submitted to AUR and has not been validated in a clean Arch chroot. The project license remains unchanged.
