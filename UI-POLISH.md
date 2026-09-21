# Settings and UI polish

This update builds on the persistent-settings version of Command Center.
Existing settings are migrated through defaults; editor, terminal, and scan
folder choices are retained.

New preferences in Settings:
- Theme: Dark, Light, or System (follows desktop color scheme).
- Text size: Standard or Larger.
- Repository layout: Cards or List.
- Default sort: name ascending, name descending, or needs attention first.
- Show/hide repository paths and the dashboard welcome banner.

Appearance previews while editing Settings. Save keeps the draft, Discard
restores saved preferences, and Reset selects defaults without saving them.
Navigating away restores saved appearance; the draft remains in Settings.
The repository toolbar can override sorting for the current session.

Repository UI now shows changed-file and ahead/behind indicators together.
A failed Git status read is shown as unavailable, and branches without an
upstream show "No tracking branch". Refresh reads local Git state only; ahead
and behind counts depend on the last fetch performed by your Git tools.
Search shortcut: Ctrl+K (Cmd+K in a browser on macOS); Escape clears search.
Errors remain visible until dismissed or replaced by a later notification.

Validation:
- `node --test tests/*.test.mjs` — preferences migration, normalization,
  simultaneous status badges, error-state filtering, and stable sorting.
- `npm run check` and `npm run build`.
- Simulated UI tests exercised preview/discard, settings save/reload, launch
  preference forwarding, save failure, and invalid-folder handling.
- Rust compilation and visual desktop verification require a local build;
  this workspace has no Rust compiler and the browser download was blocked.
