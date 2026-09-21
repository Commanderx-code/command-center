# Contributing

Thanks for helping improve Command Center. Small fixes, documentation improvements, and focused feature proposals are welcome.

## Report a bug or propose a feature

Check [existing issues](https://github.com/Commanderx-code/command-center/issues) first, then use the bug report or feature request template. For bugs, include the app version, distribution, installation method, steps to reproduce, and expected versus actual behavior. Mention whether the problem occurs in the desktop app or browser preview.

Remove secrets and personal information from screenshots and logs. Terminal transcripts and configuration files can contain credentials; include only the relevant, redacted excerpt.

## Work on a change

1. Fork the repository and create a branch for your change.
2. Follow the [installation guide](docs/installation.md#from-source-on-archgaruda) to set up the development environment.
3. Keep the change focused and update documentation when behavior changes.
4. Run the relevant [development checks](docs/development.md#checks). For interface changes, include a screenshot and verify the desktop behavior when applicable.
5. Open a pull request explaining the problem, resulting behavior, and how you verified it.

For changes to installers or catalog scripts, start in [Commander Toolbox](https://github.com/Commanderx-code/commander-toolbox). Command Center consumes a pinned revision of its shared core.

## Implementation expectations

Keep the frontend and Rust responsibilities consistent with the existing architecture. Preserve command review, compatibility checks, cancellation, private local storage, and configuration conflict detection when editing execution paths. Use temporary fixtures for tests that involve Git, backups, or subprocesses.

Prefer clear code and a small dependency footprint. Explain any new dependency or change to platform requirements in the pull request. Report checks you could not run rather than marking them as passed.
