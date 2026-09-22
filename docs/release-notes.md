# Command Center v0.4.0

- Service audit separates enabled-but-inactive entries, failed services, and normal on-demand/managed units. Displays descriptions and activation triggers without labeling services unused.
- Backup readiness reports helper availability, helper-reported drive state, and credential-source availability. Explicit Restic access tests require review and may prompt KWallet. Failed health-helper exits are no longer treated as successful health reports.
- About & updates shows the installed version and checks published stable GitHub releases on request. The source updater builds a chosen version in a temporary checkout and retains the previous locally installed binary.

This is a Linux source release. Install the documented Tauri build dependencies, Git, Node/npm, and Rust/Cargo. Use the source updater or build/install from this tag. No universal Linux binary or signed automatic updater is provided.

The first installed update may still need a patch. Later releases can be selected from Settings once published.
