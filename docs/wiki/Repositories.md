# 📂 Repositories

> _Everyday Git work across all your projects._

**Repositories** finds every Git project in your scan folders and lets you do everyday Git work without leaving the app. Every Git command is shown for review before it runs.

## Finding your projects

Command Center scans the folders listed in **Settings → Repositories** (for example `~/github/projects` and `~/dotfiles`), down to the configured **scan depth**. Each project shows its branch, number of changed files, and how far it is **ahead** of or **behind** its remote.

- **Search** by name, path or branch.
- **Filter** by changed, clean, ahead or behind, by **group**, or by **☆ Favorites**.
- **Sort** by name (A–Z or Z–A) or **Needs attention first**.
- Switch between **cards** and **list** layout, or hide paths, in **Settings → Repositories**.
- Click **↻** (Refresh repositories) after cloning something new, or set automatic refresh in Settings.

> [!TIP]
> Ahead/behind counts reflect your last **fetch**.

## Project Workspace

Click **Workspace** on a repository to open its page. It has:

### Remote: Fetch, Pull, Push

- **Fetch** downloads what's new on the remote without changing your files.
- **Pull** updates your branch, but only as a fast-forward and only when you have no uncommitted changes, so it never creates a surprise merge.
- **Push** sends your commits to the branch's upstream. It never force-pushes and never pushes tags automatically.

Authentication uses your existing Git credentials or SSH keys. If they need interactive input (for example an SSH passphrase), the job fails with a clear error instead of hanging; use the repository **Terminal** button for that.

### Review changes

Click any file to see its **diff**, then switch between **Staged** (what will be committed) and **Unstaged** (what's only on disk). **All tracked files** shows everything together. Additions and deletions are colored; binary files get a summary; very large diffs are marked as truncated.

### Stage & commit

1. Tick files and click **Stage selected**, or **Stage all** (includes new and deleted files, respects `.gitignore`).
2. **Unstage selected** takes files out of the next commit without touching your edits.
3. Check the **Staged diff**, write a **Commit message**, and click **Review & commit**.

Just before committing, the app checks that the staged files, branch and last commit haven't changed since you reviewed them. Your normal Git hooks, identity and commit signing still apply. Committing is local; click **Push** to publish.

Your draft message is kept if a commit fails or you cancel. Merge conflicts, rebases and cherry-picks in progress need to be finished in your editor or terminal.

### Branches

- **Switch branch** or **Create & switch**. Both need a clean working tree, so commit or stash first.
- **Review & publish branch** pushes a new local branch to a remote you choose and sets it as the upstream, so later pushes use the plain **Push** button.

### Stash unfinished work

**Review & stash** saves your changes (optionally **Include new (untracked) files**) and cleans the working tree. **Review & restore stash** brings them back and keeps the stash as a safety copy.

### Recent commits

The latest commits on the current branch.

## Project tasks

Save the commands you run in a project (build, test, dev server…) as one-click **tasks**:

- **Detect project tasks** reads `package.json` (build, test, dev, lint, check, start) and `Cargo.toml` (build, test, check, run) and suggests tasks. Detection only reads the files and never runs your scripts. Add the suggestions you want.
- **Add task** creates your own: a name, command, shell (Direct, Fish or Bash) and mode (Background, Embedded or External).

Tasks always run in the repository's root folder and go through review. Long-running tasks such as dev servers keep going until you stop them in **Activity**. Tasks in **different** repositories can run at the same time. See [How Commands Run](How-Commands-Run#running-several-jobs).

## Related services

Link a user or system **service** or **timer** to the project (for example the database it uses) to see its status and recent log lines right there. Linking only lets you look; to start or stop it, use the **Services** page.

## Organization & launch profile

- Mark a project as a **favorite** and put it in a **group** (for example "Work" or "Homelab").
- Add a **documentation link**.
- Choose what **Open workspace** / **Launch profile** opens: your **editor**, a **terminal** in the project folder, and/or the **documentation**. Editor and terminal are chosen in **Settings → Applications**.

## Good to know

- **Scanning a repository is always safe.** Status and diffs run with hooks, filters, external diff tools and signature checks turned off, so a repository you downloaded can't run code just by being opened. Side effect: files that a Git filter (such as Git LFS) normally rewrites may show as changed in previews. Check those in the terminal.
- Changes inside **submodules** aren't listed; a changed submodule commit is. Open the submodule itself to see its files.
- **Partial clones** with missing objects need a `git fetch` in the terminal before they can be inspected.
- Avoid running other Git tools on the same repository while an app operation is running.

---

| | |
|:--|--:|
| [← 📊 Dashboard & Needs Attention](Dashboard-and-Needs-Attention) | [🧰 Toolbox & Terminal →](Toolbox-and-Terminal) |
