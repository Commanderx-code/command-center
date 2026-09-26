<div align="center">

# 🤝 Contributing to Command Center

Thanks for helping improve Command Center.<br />
Small fixes, documentation improvements, and focused feature proposals are welcome.

<sub>[🏠 README](README.md) &nbsp;·&nbsp; [📚 Docs](docs/README.md) &nbsp;·&nbsp; [🔐 Security](SECURITY.md) &nbsp;·&nbsp; [🐛 Issues](https://github.com/Commanderx-code/command-center/issues)</sub>

</div>

## 🐛 Report a bug or propose a feature

Check [existing issues](https://github.com/Commanderx-code/command-center/issues) first, then use the bug report or feature request template. For bugs, include:

- the app version, distribution, and installation method,
- steps to reproduce,
- expected versus actual behavior,
- whether the problem occurs in the desktop app or the browser preview.

> [!CAUTION]
> **Security vulnerabilities:** don't open a public issue. Report them privately as described in [SECURITY.md](SECURITY.md).

> [!WARNING]
> Remove secrets and personal information from screenshots and logs. Terminal transcripts and configuration files can contain credentials; include only the relevant, redacted excerpt.

## 🛠️ Work on a change

1. 🍴 Fork the repository and create a branch for your change.
2. 📦 Follow the [installation guide](docs/installation.md#from-source-on-archgaruda) to set up the development environment.
3. 🎯 Keep the change focused and update documentation when behavior changes.
4. ✅ Run the relevant [development checks](docs/development.md#checks). For interface changes, include a screenshot and verify the desktop behavior when applicable.
5. 📬 Open a pull request explaining the problem, resulting behavior, and how you verified it.

> [!TIP]
> For changes to installers or catalog scripts, start in [Commander Toolbox](https://github.com/Commanderx-code/commander-toolbox). Command Center consumes a pinned revision of its shared core.

## 📐 Implementation expectations

Keep the frontend and Rust responsibilities consistent with the existing architecture. Preserve command review, compatibility checks, cancellation, private local storage, and configuration conflict detection when editing execution paths. Use temporary fixtures for tests that involve Git, backups, or subprocesses.

Prefer clear code and a small dependency footprint. Explain any new dependency or change to platform requirements in the pull request.

> [!IMPORTANT]
> Report checks you could not run rather than marking them as passed.
