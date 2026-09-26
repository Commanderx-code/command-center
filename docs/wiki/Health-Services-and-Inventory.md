# 🩺 Health, Services & Inventory

> _Disks, services, updates and installed tools._

Three pages that tell you how the machine is doing.

## System Health

A quick check-up, refreshed with **Refresh health**:

- **Disk usage** for `/` and your home folder. Disks at 90% or more also appear in [Needs attention](Dashboard-and-Needs-Attention#needs-attention).
- **Failed services**, both user and system.
- **Package updates** (Arch-based systems) from the local package database. This doesn't download a fresh package list. Use **Toolbox → Toolbox Updates** for a fresh check (see [Toolbox & Terminal](Toolbox-and-Terminal#toolbox-updates)).
- **Battery** status on laptops.
- **Installed tools:** which of Git, Nix, Home Manager, Restic, Ghostty, Fastfetch and others are installed.
- **Backup freshness** from your backup health helper.
- **Recovery readiness:** whether the pieces you'd need after a disaster are in place (dotfiles checkout, Home Manager flake, backup drive, encrypted recovery files, recovery instructions). It checks that these exist; it doesn't test decryption or a full restore.

> [!NOTE]
> Health checks only read information. They never unlock your backup repository.

## Services

**Services** lists the systemd **user** and **system** services and timers on the machine.

- **Filter** by state (**All states**, **Active**, **Inactive**, **Failed**, **Not loaded**) and search by name or description. **Enabled but inactive · review** finds services set to start at boot that aren't running. That's often normal (timers, on-demand services), but worth a look.
- Select a service to see its **properties**, what depends on it, and its **latest 100 log lines**.
- **User services** can be **started**, **stopped** or **restarted** (reviewed like any command). **System services** are view-only. Manage those from a terminal with `sudo`.

### Service cleanup

Expand **Service cleanup** and click **Export cleanup helper** to save a script to Downloads. The app never runs it. Run it yourself:

```sh
bash ~/Downloads/service-cleanup.sh user      # audit your user services
bash ~/Downloads/service-cleanup.sh system    # audit system services
```

To disable a service you've decided you don't need:

```sh
bash ~/Downloads/service-cleanup.sh user --disable NAME.service
sudo bash ~/Downloads/service-cleanup.sh system --disable NAME.service
```

The helper shows the service's details, what depends on it and how to re-enable it, then asks you to type its full name to confirm. It only **disables** loaded, enabled, inactive services. It never deletes, masks, uninstalls or stops anything. Failed services need investigating, not cleanup.

## System inventory

**System inventory** collects a summary of the machine: OS and kernel, CPU, memory, storage and disk usage, and the versions of installed tools. Anything missing or slow to answer shows as unavailable.

**Export displayed report** saves it as JSON in Downloads, which is handy for bug reports or comparing machines. It can include mount paths and configuration details, so read it before sharing. Nothing is uploaded.

---

| | |
|:--|--:|
| [← 🎛️ Configuration](Configuration) | [🕒 Activity & Change Timeline →](Activity-and-Change-Timeline) |
