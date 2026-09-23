use crate::{
    platform as p,
    settings::{Integrations, Settings},
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{fs, path::Path, process::Command};

#[tauri::command]
pub fn detect_integrations() -> Integrations {
    let mut out = Integrations::default();
    let machine = p::config_home().join("dotfiles/machine.json");
    let data: Value = fs::read(machine)
        .ok()
        .and_then(|v| serde_json::from_slice(&v).ok())
        .unwrap_or(Value::Null);
    let field = |k| data.get(k).and_then(Value::as_str).unwrap_or("").to_owned();
    out.dotfiles_path = field("dotfilesDirectory");
    out.flake_profile = field("username");
    out.restic_repository = field("resticRepository");
    out.wallet = field("wallet");
    out.wallet_folder = field("walletFolder");
    out.wallet_entry = field("walletEntry");
    if out.dotfiles_path.is_empty() {
        for candidate in [
            p::home().join("github/projects/Commander-os"),
            p::home().join("github/projects/dotfiles"),
            p::home().join("dotfiles"),
        ] {
            if candidate.join("home-manager/flake.nix").is_file() || candidate.join("flake.nix").is_file() {
                out.dotfiles_path = candidate.to_string_lossy().into_owned();
                break;
            }
        }
    }
    for (target, script) in [
        (&mut out.backup_script, "backup-personal"),
        (&mut out.full_backup_script, "backup-everything"),
        (&mut out.backup_health_script, "backup-health"),
    ] {
        let path = p::home().join(".local/bin").join(script);
        if path.is_file() {
            *target = path.to_string_lossy().into_owned();
        }
    }
    let mount = field("backupMount");
    if !mount.is_empty() {
        out.secrets_directory = format!("{mount}/secrets");
    }
    for (target, app, file) in [
        (&mut out.ghostty_source, "ghostty", "config"),
        (&mut out.fastfetch_source, "fastfetch", "config.jsonc"),
    ] {
        let live = p::config_home().join(app).join(file);
        let managed = live
            .canonicalize()
            .map(|v| v.starts_with("/nix/store"))
            .unwrap_or(false);
        let source = Path::new(&out.dotfiles_path)
            .join("configs")
            .join(app)
            .join(file);
        *target = if managed && source.is_file() {
            source
        } else {
            live
        }
        .to_string_lossy()
        .into_owned();
    }
    for file in ["RECOVERY.md", "docs/recovery.md", "README.md"] {
        let path = Path::new(&out.dotfiles_path).join(file);
        if path.is_file() {
            out.recovery_notes_path = path.to_string_lossy().into_owned();
            break;
        }
    }
    out
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Request {
    pub profile_id: String,
    pub inputs: std::collections::BTreeMap<String,String>,
    pub scope: String,
    pub unit: String,
    pub schedule: String,
    pub hour: u8,
    pub minute: u8,
    pub stash_id: String,
    pub remote: String,
    pub branch_name: String,
    pub custom_id: String,
    pub files: Vec<String>,
    pub message: String,
    pub index_tree: String,
    pub expected_head: String,
    pub branch_ref: String,
    pub tool_id: String,
    pub terminal_mode: String,
    pub action: String,
    pub path: String,
    pub snapshot: String,
    pub directory: String,
    pub target: String,
    pub include: String,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Plan {
    pub interactive: bool,
    pub id: String,
    pub title: String,
    pub program: String,
    pub args: Vec<String>,
    pub cwd: String,
    pub explanation: String,
    pub timeout_seconds: u64,
    pub external_terminal: bool,
    #[serde(skip)]
    pub create_target: Option<String>,
}
impl Plan {
    pub(crate) fn new(title: &str, program: &str, args: Vec<String>, cwd: &Path) -> Self {
        Self {
            interactive: false,
            id: String::new(),
            title: title.into(),
            program: program.into(),
            args,
            cwd: cwd.to_string_lossy().into_owned(),
            explanation: String::new(),
            timeout_seconds: 3600,
            external_terminal: false,
            create_target: None,
        }
    }
    pub fn command(&self) -> Command {
        let mut c = Command::new(&self.program);
        c.args(&self.args)
            .current_dir(&self.cwd)
            .env("GIT_TERMINAL_PROMPT", "0")
            .env("GIT_SSH_COMMAND", "ssh -oBatchMode=yes -oConnectTimeout=15")
            .env("NO_COLOR", "1")
            .env("TERM", "dumb");
        c
    }
}
fn vecs(values: &[&str]) -> Vec<String> {
    values.iter().map(|v| v.to_string()).collect()
}
fn snapshot_id(id: &str) -> Result<(), String> {
    if !(8..=64).contains(&id.len()) || !id.bytes().all(|b| b.is_ascii_hexdigit()) {
        Err("Select a snapshot first".into())
    } else {
        Ok(())
    }
}
pub fn restic_args(i: &Integrations) -> Result<Vec<String>, String> {
    if i.restic_repository.is_empty() {
        return Err("Configure the Restic repository in Settings".into());
    }
    if let Ok(url) = tauri::Url::parse(&i.restic_repository) {
        if url.password().is_some() {
            return Err("Use Restic's credential environment or password file instead of a password embedded in the repository URL".into());
        }
    }
    let repository = if i.restic_repository.starts_with("~/") {
        p::expand(&i.restic_repository)?
            .to_string_lossy()
            .into_owned()
    } else {
        i.restic_repository.clone()
    };
    let mut args = vecs(&["--repo", &repository]);
    if !i.restic_password_file.is_empty() {
        let file = p::expand(&i.restic_password_file)?;
        if !file.is_file() {
            return Err("Restic password file is unavailable".into());
        }
        args.extend(vecs(&["--password-file", &file.to_string_lossy()]));
    } else if !i.wallet.is_empty() && !i.wallet_entry.is_empty() {
        let command = shell_words::join([
            "kwallet-query",
            "-f",
            &i.wallet_folder,
            "-r",
            &i.wallet_entry,
            &i.wallet,
        ]);
        args.extend(vecs(&["--password-command", &command]));
    } else if std::env::var_os("RESTIC_PASSWORD_FILE").is_none()
        && std::env::var_os("RESTIC_PASSWORD_COMMAND").is_none()
        && std::env::var_os("RESTIC_PASSWORD").is_none()
    {
        return Err("Configure KWallet or a Restic password file; passwords are never stored by Command Center".into());
    }
    Ok(args)
}
pub fn build_plan(r: &Request, s: &Settings) -> Result<Plan, String> {
    s.validate()?;
    if r.action.starts_with("service-") || r.action.starts_with("timer-") || r.action == "schedule-save" { return crate::system_tools::plan(r,s); }
    if ["stage", "stage-all", "unstage", "commit", "branch-create", "branch-switch", "stash-create", "stash-apply", "branch-publish"].contains(&r.action.as_str()) {
        return crate::git_changes::plan(r);
    }
    if r.action == "tool-update" { return crate::toolbox_updates::plan(r); }
    if r.action == "custom" { return crate::custom_actions::plan(r, s); }
    let i = &s.integrations;
    if ["fetch", "pull", "push", "sync-fetch", "sync-pull"].contains(&r.action.as_str()) {
        let path = p::repo(if r.action.starts_with("sync-") {
            &i.dotfiles_path
        } else {
            &r.path
        })?;
        let action = r.action.strip_prefix("sync-").unwrap_or(&r.action);
        let mut args = vec!["-C".into(), path.to_string_lossy().into_owned()];
        let explanation;
        match action {
            "fetch" => {
                args.extend(vecs(&["fetch", "--all", "--prune", "--progress"]));
                explanation =
                    "Refresh remote-tracking branches. Your working files stay unchanged.";
            }
            "pull" | "push" => {
                let branch = p::git(&path, &["symbolic-ref", "--quiet", "--short", "HEAD"])?;
                if branch.trim().is_empty() {
                    return Err("Detached HEAD: switch to a branch in your Git tool first".into());
                }
                p::git(&path, &["rev-parse", "--verify", "@{upstream}"])
                    .map_err(|_| "Set an upstream branch in your Git tool first")?;
                if action == "pull" {
                    if !p::git(&path, &["status", "--porcelain"])?.trim().is_empty() {
                        return Err("Commit or stash working changes before pulling".into());
                    }
                    args.extend(vecs(&[
                        "pull",
                        "--ff-only",
                        "--no-rebase",
                        "--no-autostash",
                        "--progress",
                    ]));
                    explanation = "Update this clean branch by fast-forward only. Diverged histories stop for review.";
                } else {
                    let remote = p::git(
                        &path,
                        &[
                            "config",
                            "--get",
                            &format!("branch.{}.remote", branch.trim()),
                        ],
                    )?;
                    let merge = p::git(
                        &path,
                        &[
                            "config",
                            "--get",
                            &format!("branch.{}.merge", branch.trim()),
                        ],
                    )?;
                    if remote.trim().starts_with('-') || !merge.trim().starts_with("refs/heads/") {
                        return Err("Unsupported upstream configuration".into());
                    }
                    args.extend(vecs(&[
                        "-c",
                        "push.followTags=false",
                        "push",
                        "--porcelain",
                        "--no-force",
                        "--",
                        remote.trim(),
                        &format!("HEAD:{}", merge.trim()),
                    ]));
                    explanation = "Publish the current branch to its configured upstream. This never force-pushes.";
                }
            }
            _ => unreachable!(),
        }
        let mut plan = Plan::new(
            &format!(
                "{} · {}",
                action,
                path.file_name().unwrap_or_default().to_string_lossy()
            ),
            "git",
            args,
            &path,
        );
        plan.explanation = explanation.into();
        return Ok(plan);
    }
    if ["hm-build", "hm-switch"].contains(&r.action.as_str()) {
        let path = p::repo(&i.dotfiles_path)?;
        let flake = if path.join("home-manager/flake.nix").exists() {
            path.join("home-manager")
        } else {
            path.clone()
        };
        if !flake.join("flake.nix").is_file() {
            return Err("No Home Manager flake found".into());
        }
        if i.flake_profile.is_empty() {
            return Err("Set your Home Manager profile in Settings".into());
        }
        let action = if r.action == "hm-build" {
            "build"
        } else {
            "switch"
        };
        let reference = format!("{}#{}", flake.display(), i.flake_profile);
        let mut plan = Plan::new(
            &format!("Home Manager {action}"),
            "home-manager",
            vecs(&[action, "--flake", &reference]),
            &path,
        );
        plan.explanation = if action == "build" { "Build and validate your configuration without activating it." } else { "Build and activate your Home Manager configuration. Managed files and user services may change." }.into();
        return Ok(plan);
    }
    if ["backup", "backup-full"].contains(&r.action.as_str()) {
        let health=crate::health::backup_report(s);
        if health["data"]["drive_mounted"]==false {
            return Err("Backup helper reports the backup drive is disconnected. Connect it and refresh health.".into());
        }
        let full = r.action == "backup-full";
        let script = p::expand(if full {
            &i.full_backup_script
        } else {
            &i.backup_script
        })?;
        if !script.is_file() {
            return Err("Backup helper is unavailable".into());
        }
        let mut plan = Plan::new(
            if full {
                "Full recovery backup"
            } else {
                "Personal backup"
            },
            &script.to_string_lossy(),
            vec![],
            &p::home(),
        );
        plan.timeout_seconds = 24 * 3600;
        plan.external_terminal = full;
        plan.explanation = if full { "Run your existing full-backup workflow in your selected terminal for encryption prompts. Completion is recorded here; private terminal input and output are not captured." } else { "Run your existing personal backup helper, including its verification steps. KWallet may ask you to unlock it." }.into();
        if health["available"]!=true {plan.explanation.push_str(" Backup health is unavailable; drive readiness could not be verified.");}
        return Ok(plan);
    }
    if ["snapshots", "snapshot-files", "restic-check", "restic-access", "restore"].contains(&r.action.as_str()) {
        let mut args = restic_args(i)?;
        let mut plan = Plan::new("Restic", "restic", vec![], &p::home());
        match r.action.as_str() {
            "snapshots" => {
                args.extend(vecs(&["snapshots", "--json", "--latest", "30"]));
                plan.title = "Browse backup snapshots".into();
            }
            "snapshot-files" => {
                snapshot_id(&r.snapshot)?;
                let dir = if r.directory.is_empty() {
                    "/"
                } else {
                    &r.directory
                };
                if !dir.starts_with('/') || dir.contains('\0') {
                    return Err("Invalid snapshot directory".into());
                }
                args.extend(vecs(&["ls", "--json", &r.snapshot, dir]));
                plan.title = "Browse snapshot files".into();
            }
            "restic-access" => {
                args.extend(vecs(&["cat", "config"]));
                plan.title = "Test Restic repository access".into();
                plan.explanation = "Read and decrypt repository configuration using the Restic settings. KWallet may request an unlock. Success confirms access now, not backup integrity or your backup helper’s separate configuration. No backup or restore is performed.".into();
            }
            "restic-check" => {
                args.push("check".into());
                plan.title = "Verify backup repository".into();
                plan.explanation = "Check repository structure and metadata. This does not perform a full read of every data block.".into();
            }
            "restore" => {
                let (ok, help, error) = p::output(Command::new("restic").args(["restore", "--help"]), 15)?;
                if !ok || !help.contains("--overwrite") || !help.contains("--verify") {
                    return Err(format!("File restore requires Restic 0.17 or newer with --overwrite and --verify support. Update Restic before restoring. {error}"));
                }
                snapshot_id(&r.snapshot)?;
                let target = p::expand(&r.target)?;
                validate_restore_target(&target)?;
                args.extend(vecs(&[
                    "restore",
                    &r.snapshot,
                    "--target",
                    &target.to_string_lossy(),
                    "--overwrite",
                    "never",
                    "--verify",
                ]));
                if !r.include.is_empty() {
                    if !r.include.starts_with('/') || r.include.contains(['\0', '\n']) {
                        return Err("Use an absolute snapshot path or pattern".into());
                    }
                    args.extend(vecs(&["--include", &r.include]));
                }
                plan.title = "Restore backup into a new folder".into();
                plan.create_target = Some(target.to_string_lossy().into_owned());
                plan.explanation = "Restore into a new folder and verify the restored data. Existing files are never overwritten. An empty selection restores the whole snapshot.".into();
            }
            _ => unreachable!(),
        }
        plan.args = args;
        plan.timeout_seconds = if r.action=="restic-access" {120} else {24 * 3600};
        if plan.explanation.is_empty() {
            plan.explanation = "Read backup metadata using your configured Restic credentials. KWallet may request an unlock.".into();
        }
        return Ok(plan);
    }
    Err("Unknown action".into())
}
pub fn validate_restore_target(target: &Path) -> Result<(), String> {
    if target.exists() || fs::symlink_metadata(target).is_ok() || target.file_name().is_none() {
        return Err("Choose a new, nonexistent destination folder".into());
    }
    if target
        .components()
        .any(|v| matches!(v, std::path::Component::ParentDir))
    {
        return Err("Destination cannot contain ..".into());
    }
    let parent = target
        .parent()
        .ok_or("Invalid destination")?
        .canonicalize()
        .map_err(|_| "The destination's parent folder must exist")?;
    let home = p::home().canonicalize().map_err(|e| e.to_string())?;
    if !parent.starts_with(&home) {
        return Err("Restore into a new folder beneath your home directory".into());
    }
    Ok(())
}

#[tauri::command]
pub async fn sync_status(app: tauri::AppHandle) -> Result<Value, String> {
    let s = crate::settings::load_settings(app)?.unwrap_or_default();
    tauri::async_runtime::spawn_blocking(move || {
        let path = p::repo(&s.integrations.dotfiles_path)?;
        Ok(json!({"path":path,"branch":p::git(&path,&["branch","--show-current"])?,
            "changes":p::git(&path,&["status","--short"])?, "diff":p::git(&path,&["diff","--no-ext-diff","--stat","HEAD"]).unwrap_or_default(),
            "upstream":p::git(&path,&["rev-list","--left-right","--count","HEAD...@{upstream}"]).ok(),
            "configDrift":crate::configuration::drift(&s),
            "generations":p::output(Command::new("home-manager").arg("generations"),15).ok().map(|(_,out,_)|out)}))
    }).await.map_err(|e| e.to_string())?
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_option_like_snapshot_ids() {
        assert!(snapshot_id("--delete").is_err());
        assert!(snapshot_id("a1b2c3d4").is_ok());
    }
    #[test]
    fn rejects_existing_restore_targets() {
        assert!(validate_restore_target(&p::home()).is_err());
        assert!(validate_restore_target(Path::new("/tmp/new-restore")).is_err());
    }
    #[test]
    fn rejects_unknown_actions() {
        assert!(build_plan(
            &Request {
                action: "rm".into(),
                ..Default::default()
            },
            &Settings::default()
        )
        .is_err());
    }
}

#[cfg(test)]
mod workflow_tests {
    use super::*;
    use std::path::PathBuf;
    fn git(path: &Path, args: &[&str]) -> String {
        // Fixture setup includes intentional clones and pushes, unlike probes.
        let (ok, out, err) =
            p::output(Command::new("git").arg("-C").arg(path).args(args), 15).unwrap();
        assert!(ok, "{err}");
        out
    }
    fn commit(path: &Path, name: &str) {
        fs::write(path.join(name), name).unwrap();
        git(path, &["add", "."]);
        git(
            path,
            &[
                "-c",
                "user.name=Fixture",
                "-c",
                "user.email=fixture@example.invalid",
                "commit",
                "-m",
                name,
            ],
        );
    }
    fn setup() -> (tempfile::TempDir, PathBuf, PathBuf) {
        let temp = tempfile::tempdir().unwrap();
        let remote = temp.path().join("remote.git");
        let clone = temp.path().join("working copy");
        git(temp.path(), &["init", "--bare", remote.to_str().unwrap()]);
        git(
            temp.path(),
            &["clone", remote.to_str().unwrap(), clone.to_str().unwrap()],
        );
        commit(&clone, "first.txt");
        git(&clone, &["push", "-u", "origin", "HEAD"]);
        (temp, remote, clone)
    }
    #[test]
    fn git_actions_use_fast_forward_and_publish_only_the_upstream_branch() {
        let (_temp, _remote, repo) = setup();
        let s = Settings::default();
        let request = |action: &str| Request {
            action: action.into(),
            path: repo.to_string_lossy().into_owned(),
            ..Default::default()
        };
        let fetch = build_plan(&request("fetch"), &s).unwrap();
        assert!(p::output(&mut fetch.command(), 30).unwrap().0);
        let pull = build_plan(&request("pull"), &s).unwrap();
        assert!(pull.args.contains(&"--ff-only".into()));
        assert!(p::output(&mut pull.command(), 30).unwrap().0);
        fs::write(repo.join("untracked.txt"), "do not overwrite").unwrap();
        assert!(build_plan(&request("pull"), &s)
            .unwrap_err()
            .contains("Commit or stash"));
        commit(&repo, "second.txt");
        let push = build_plan(&request("push"), &s).unwrap();
        assert!(push.args.contains(&"--no-force".into()));
        assert!(!push.args.iter().any(|v| v.starts_with('+')));
        assert!(p::output(&mut push.command(), 30).unwrap().0);
        git(&repo, &["checkout", "--detach"]);
        assert!(build_plan(&request("push"), &s).is_err());
    }
    #[test]
    fn diverged_pull_fails_without_changing_local_head() {
        let (temp, remote, repo) = setup();
        let other = temp.path().join("other");
        git(
            temp.path(),
            &["clone", remote.to_str().unwrap(), other.to_str().unwrap()],
        );
        commit(&other, "remote-change");
        git(&other, &["push"]);
        commit(&repo, "local-change");
        let before = git(&repo, &["rev-parse", "HEAD"]);
        let plan = build_plan(
            &Request {
                action: "pull".into(),
                path: repo.to_string_lossy().into_owned(),
                ..Default::default()
            },
            &Settings::default(),
        )
        .unwrap();
        let (ok, _, _) = p::output(&mut plan.command(), 30).unwrap();
        assert!(!ok);
        assert_eq!(git(&repo, &["rev-parse", "HEAD"]), before);
    }
    #[test]
    fn restic_snapshot_browse_and_selective_restore_round_trip() {
        if !p::available("restic") {
            eprintln!("Restic unavailable; fixture test skipped");
            return;
        }
        let temp = tempfile::Builder::new()
            .prefix(".command-center-test-")
            .tempdir_in(p::home())
            .unwrap();
        let repo = temp.path().join("restic");
        let password = temp.path().join("password");
        fs::write(&password, "temporary-fixture-password").unwrap();
        let data = temp.path().join("input");
        fs::create_dir(&data).unwrap();
        fs::write(data.join("wanted.txt"), "restore me").unwrap();
        fs::write(data.join("other.txt"), "do not select").unwrap();
        let mut s = Settings::default();
        s.integrations.restic_repository = repo.to_string_lossy().into_owned();
        s.integrations.restic_password_file = password.to_string_lossy().into_owned();
        let base = restic_args(&s.integrations).unwrap();
        let run =
            |args: &[&str]| p::output(Command::new("restic").args(&base).args(args), 60).unwrap();
        assert!(run(&["init"]).0);
        assert!(run(&["backup", data.to_str().unwrap()]).0);
        let plan = build_plan(
            &Request {
                action: "snapshots".into(),
                ..Default::default()
            },
            &s,
        )
        .unwrap();
        let (ok, out, err) = p::output(&mut plan.command(), 30).unwrap();
        assert!(ok, "{err}");
        let snapshots: Value = serde_json::from_str(&out).unwrap();
        let id = snapshots[0]["id"].as_str().unwrap();
        let plan = build_plan(
            &Request {
                action: "snapshot-files".into(),
                snapshot: id.into(),
                directory: data.to_string_lossy().into_owned(),
                ..Default::default()
            },
            &s,
        )
        .unwrap();
        let (ok, out, err) = p::output(&mut plan.command(), 30).unwrap();
        assert!(ok, "{err}");
        assert!(out.contains("wanted.txt"));
        let destination = temp.path().join("restored");
        let selected = data.join("wanted.txt");
        let request = Request {
            action: "restore".into(),
            snapshot: id.into(),
            target: destination.to_string_lossy().into_owned(),
            include: selected.to_string_lossy().into_owned(),
            ..Default::default()
        };
        let plan = build_plan(&request, &s).unwrap();
        fs::create_dir(&destination).unwrap();
        let (ok, _, err) = p::output(&mut plan.command(), 30).unwrap();
        assert!(ok, "{err}");
        assert_eq!(
            fs::read_to_string(destination.join(selected.strip_prefix("/").unwrap())).unwrap(),
            "restore me"
        );
        assert!(!destination
            .join(data.join("other.txt").strip_prefix("/").unwrap())
            .exists());
        assert!(build_plan(&request, &s).is_err());
    }
}
