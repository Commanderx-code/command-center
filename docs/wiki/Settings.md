# ⚙️ Settings

> _Everything configurable, section by section._

**Settings** holds everything configurable. Use **Search settings** at the top to filter by keyword (try "terminal", "theme" or "backup"), or jump with the section links.

> [!NOTE]
> Changes are a **draft** until you click **Save settings**. **Discard changes** returns to what's saved, and **Reset to defaults** starts over. Appearance changes preview as you edit.

## 01 · General

| Setting | What it does |
|---|---|
| Display name | Used in your greeting |
| Start page | The page Command Center opens on: any page, including Toolbox, Activity or Needs attention |

## 02 · Applications

| Setting | What it does |
|---|---|
| Editor | What opens projects: your system default, Kate, Neovim (opens in your terminal), VS Code, VSCodium or Zed |
| Terminal | Used for **External** jobs and repository terminals: system default, Ghostty, Konsole, GNOME Terminal, kitty, Alacritty, WezTerm or foot |

With **system default**, the app uses your `$VISUAL` / `$EDITOR` and `$TERMINAL` settings or your desktop's defaults.

## 03 · Appearance

Theme (**Dark**, **Light** or **System**), **Text size**, the **Dashboard welcome banner**, **Accent color** (Glacier · Cyan, Dusk · Violet, Mint · Green), **Repository density** (Comfortable or Compact) and **Reduce motion**.

## 04 · Repositories

| Setting | What it does |
|---|---|
| Repository layout | Cards or List |
| Default sort | Name A–Z, Name Z–A, or Needs attention first |
| Show repository paths | Show or hide full paths |
| Scan depth | How many folder levels below each scan folder to search (1–6) |
| Automatic refresh | Re-read Git status every 30 seconds, 1 minute or 5 minutes, or manually only. This never fetches or pulls |
| Scan folders | One folder per line (`~/…` or absolute). Build and dependency folders such as `node_modules` are skipped |

## 05 · System integrations

Connects the app to your existing tools. **Detect existing setup** fills empty fields automatically. **Check availability** tests the current values without saving or running anything.

| Field | What to enter |
|---|---|
| Dotfiles repository | Your dotfiles checkout, containing the Home Manager flake |
| Home Manager profile | The flake output name, for example `commander` |
| Personal backup helper | Your everyday backup script |
| Full backup helper | Your full backup script (runs in a terminal, so it can ask for passwords) |
| Backup health helper | A script that prints backup status as JSON. **It runs automatically for status checks**, so only use a script you trust |
| Restic repository | A local path or a Restic repository address. Don't put a password in the address: addresses that contain one, including `rest:` addresses, are refused. For a REST server, set `RESTIC_REST_USERNAME` and `RESTIC_REST_PASSWORD` in the environment Command Center starts in |
| Restic password file · KWallet name / folder / entry | Where to get the repository password. The app stores only *where* the password is, never the password itself |
| Ghostty / Fastfetch source file | The editable files in your dotfiles, not the `/nix/store` copies |
| Encrypted recovery folder | Checked for `.gpg` / `.age` files; they're never opened |
| Recovery instructions | Your "how to rebuild this machine" document |
| Backup freshness (hours) | When a backup counts as overdue |

## 06 · Custom quick actions

Buttons for your own commands on the dashboard. See [Dashboard → Adding quick actions](Dashboard-and-Needs-Attention#adding-quick-actions).

## Desktop notifications & tray

Opt in to notifications for **completed tasks**, **failed tasks** and **health changes**, and set **Quiet hours** (a start and end hour; the same value for both turns quiet hours off). Notifications need `notify-send` and a notification service. This section shows whether they're available. Notifications never include command output.

## Setup & portability

- **Setup wizard** reopens the [first-run wizard](Getting-Started#1-the-setup-wizard).
- **Export setup bundle… / Import setup bundle…** move your whole setup between machines. See [Moving to a New Machine](Moving-to-a-New-Machine).

## Export and import settings

**Export saved settings** saves just your preferences and custom commands as JSON in Downloads. **Import settings…** previews a file. By default it keeps this machine's paths, apps, integrations and commands, and a checkbox includes them too. The **backup health helper** is never imported. Imported settings land in the draft. Nothing is saved or run until you click **Save settings**.

For moving everything (workflows, profiles, tools, project settings…), use a setup bundle instead.

## About & updates

Shows the installed version. **Check for releases** asks GitHub for the newest release (only when clicked). **Open releases** opens the releases page. **Export source updater** is for installs built from source. See [Installation → Updating](Installation#updating).

---

| | |
|:--|--:|
| [← 🕒 Activity & Change Timeline](Activity-and-Change-Timeline) | [🚚 Moving to a New Machine →](Moving-to-a-New-Machine) |
