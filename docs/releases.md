# Releases and updates

## Installing a published release

Open Settings → About & updates. Check for releases, read the notes, then export the source updater. Close Command Center and run the displayed command, for example:

```sh
bash ~/Downloads/update-desktop.sh v0.4.0
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
git tag -a v0.4.0 -m 'Command Center v0.4.0'
git push origin v0.4.0
npm run release:draft -- v0.4.0
```

The draft command requires an authenticated GitHub CLI (`gh`). It checks for a clean working tree and a matching local/remote tag, runs checks, tests, and the desktop build, then creates an **unpublished** GitHub release using docs/release-notes.md. It does not push tags or publish the draft. Review and publish on GitHub after testing the app on your machine. GitHub supplies source archives automatically; this workflow does not claim that a build on Garuda is portable across Linux distributions.

The initial v0.4.0 release must be published before the app can discover it. Nothing is published merely by applying this patch or opening the app.
