<div align="center">

<img src="https://raw.githubusercontent.com/Commanderx-code/command-center/main/src-tauri/icons/command-center.svg" alt="Command Center icon" width="96" />

# Command Center Guide

### Your Linux workstation, under control.

Your Git repositories, the Commander Toolbox installers, dotfiles and Home Manager, backups and restores,<br />
configuration files, services, and system health, in one desktop app.

**Runs locally as your normal user · No account · No cloud service · No telemetry**

<br />

<img src="https://raw.githubusercontent.com/Commanderx-code/command-center/main/docs/images/dashboard.jpg" alt="Command Center dashboard" width="900" />

</div>

> [!NOTE]
> This wiki is written for **Command Center 0.7.1**. Check your version under **Settings → About & updates**.

## 🔍 The one rule: you see every command first

Command Center never runs anything behind your back. Every action that changes your system opens a **review** first. The review shows the exact command and the folder it runs in, and nothing starts until you confirm. Results are kept in **Activity**.

> [!TIP]
> Read [How Commands Run](How-Commands-Run) once. It explains the review, running jobs side by side, stopping jobs, and what the app does on its own (only read-only checks).

## 🏁 Quick start

1. 📦 [Install Command Center](Installation) and launch it from your application menu.
2. 🧙 Follow the **setup wizard**: choose your repository folders, detect your dotfiles, Home Manager and backup helpers, then check what's installed. See [Getting Started](Getting-Started).
3. 📂 Open **Repositories** to see every project and its status.
4. 🧰 Open **Toolbox**, pick a tool and choose **Review & run**.
5. ⌨️ Press **Ctrl+K** anywhere to jump to a page, repository or quick action.

## 🗺️ What can it do?

<table>
  <tr>
    <td width="50%" valign="top">
      <h3>📊 <a href="https://github.com/Commanderx-code/command-center/wiki/Dashboard-and-Needs-Attention">Dashboard &amp; Needs Attention</a></h3>
      See repositories, backups, configuration and health at a glance, launch your own quick actions, and see everything that wants your action in one list.
    </td>
    <td width="50%" valign="top">
      <h3>📂 <a href="https://github.com/Commanderx-code/command-center/wiki/Repositories">Repositories</a></h3>
      Find all your Git projects, review changes, stage, commit, branch, stash, fetch/pull/push, and run project tasks.
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <h3>🧰 <a href="https://github.com/Commanderx-code/command-center/wiki/Toolbox-and-Terminal">Toolbox &amp; Terminal</a></h3>
      Browse and run the 215 Commander Toolbox installers and your own personal tools, and answer their prompts inside the app.
    </td>
    <td width="50%" valign="top">
      <h3>🔁 <a href="https://github.com/Commanderx-code/command-center/wiki/Workflows-and-Machine-Profiles">Workflows &amp; Machine Profiles</a></h3>
      Save multi-step maintenance routines and new-machine setup recipes.
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <h3>🗄️ <a href="https://github.com/Commanderx-code/command-center/wiki/Backup-and-Restore">Backup &amp; Restore</a></h3>
      Run backups, browse Restic snapshots, find every saved version of a file, restore files, schedule backups, and prove recovery works.
    </td>
    <td width="50%" valign="top">
      <h3>🔄 <a href="https://github.com/Commanderx-code/command-center/wiki/System-Sync">System Sync</a></h3>
      Review dotfiles changes, then build and apply Home Manager.
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <h3>🎛️ <a href="https://github.com/Commanderx-code/command-center/wiki/Configuration">Configuration</a></h3>
      Edit Ghostty and Fastfetch with visual controls, a preview, validation and history.
    </td>
    <td width="50%" valign="top">
      <h3>🩺 <a href="https://github.com/Commanderx-code/command-center/wiki/Health-Services-and-Inventory">Health, Services &amp; Inventory</a></h3>
      Check disks, failed services, updates, and installed tools; manage user services.
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <h3>🕒 <a href="https://github.com/Commanderx-code/command-center/wiki/Activity-and-Change-Timeline">Activity &amp; Change Timeline</a></h3>
      See every command's output and result, and search what changed and when.
    </td>
    <td width="50%" valign="top">
      <h3>⚙️ <a href="https://github.com/Commanderx-code/command-center/wiki/Settings">Settings</a></h3>
      Connect your setup, customize the app, and <a href="https://github.com/Commanderx-code/command-center/wiki/Moving-to-a-New-Machine">move it to another machine</a>.
    </td>
  </tr>
</table>

## 📚 More

|                                                                              |                                                                 |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 🚚 [Moving to a New Machine](Moving-to-a-New-Machine)                        | Carry your whole setup to another computer with a setup bundle. |
| 🔒 [Your Data & Privacy](Your-Data-and-Privacy)                              | What's stored, where, and what the app never does on its own.   |
| 🛟 [Troubleshooting & FAQ](Troubleshooting-and-FAQ)                          | Fixes for common problems.                                      |
| 🐛 [Open an issue](https://github.com/Commanderx-code/command-center/issues) | Found a bug or have an idea? Let us know.                       |
