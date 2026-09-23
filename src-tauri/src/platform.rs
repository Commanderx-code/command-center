use serde::{de::DeserializeOwned, Serialize};
use std::{
    env, fs,
    io::Read,
    os::unix::{fs::OpenOptionsExt, process::CommandExt},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::Manager;

pub fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
pub fn home() -> PathBuf {
    PathBuf::from(env::var_os("HOME").unwrap_or_default())
}
pub fn config_home() -> PathBuf {
    env::var_os("XDG_CONFIG_HOME")
        .filter(|v| !v.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| home().join(".config"))
}
pub fn expand(value: &str) -> Result<PathBuf, String> {
    if value.is_empty() || value.contains('\0') {
        return Err("Configure a path in Settings first".into());
    }
    let path = if value == "~" {
        home()
    } else if let Some(rest) = value.strip_prefix("~/") {
        home().join(rest)
    } else {
        PathBuf::from(value)
    };
    if !path.is_absolute() {
        return Err("An absolute path is required".into());
    }
    Ok(path)
}
pub fn repo(value: &str) -> Result<PathBuf, String> {
    let path = expand(value)?.canonicalize().map_err(|e| e.to_string())?;
    if !path.is_dir() || !path.join(".git").exists() {
        return Err("Not a Git working tree".into());
    }
    Ok(path)
}
/// Desktop launchers may not inherit Fish's PATH additions. Preserve existing
/// precedence and add the standard per-user tool directories before starting Tauri.
pub fn initialize_path() {
    let mut paths: Vec<PathBuf> = env::var_os("PATH")
        .map(|value| env::split_paths(&value).collect())
        .unwrap_or_default();
    for candidate in [home().join(".local/bin"), home().join(".nix-profile/bin")] {
        if candidate.is_dir() && !paths.contains(&candidate) {
            paths.push(candidate);
        }
    }
    if let Ok(value) = env::join_paths(paths) {
        env::set_var("PATH", value);
    }
}

pub fn available(name: &str) -> bool {
    env::var_os("PATH")
        .map(|v| env::split_paths(&v).any(|p| p.join(name).is_file()))
        .unwrap_or(false)
}
pub fn data_file(app: &tauri::AppHandle, name: &str) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_local_data_dir()
        .map_err(|e| e.to_string())?
        .join(name))
}
pub fn atomic_write(path: &Path, data: &[u8]) -> Result<(), String> {
    use std::io::Write;
    fs::create_dir_all(path.parent().ok_or("Invalid path")?).map_err(|e| e.to_string())?;
    let tmp = path.with_extension(format!("tmp-{}", now()));
    let result = (|| {
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .mode(0o600)
            .open(&tmp)
            .map_err(|e| e.to_string())?;
        file.write_all(data)
            .and_then(|_| file.sync_all())
            .map_err(|e| e.to_string())?;
        fs::rename(&tmp, path).map_err(|e| e.to_string())
    })();
    if result.is_err() {
        let _ = fs::remove_file(tmp);
    }
    result
}
pub fn save<T: Serialize>(path: &Path, data: &T) -> Result<(), String> {
    atomic_write(
        path,
        &serde_json::to_vec_pretty(data).map_err(|e| e.to_string())?,
    )
}
pub fn load<T: DeserializeOwned + Default>(path: &Path) -> Result<T, String> {
    match fs::read(path) {
        Ok(data) => serde_json::from_slice(&data).map_err(|e| e.to_string()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(T::default()),
        Err(e) => Err(e.to_string()),
    }
}
// Read-only probes are bounded and never inherit an interactive stdin.
pub fn output(command: &mut Command, seconds: u64) -> Result<(bool, String, String), String> {
    command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .process_group(0);
    let mut child = command.spawn().map_err(|e| e.to_string())?;
    let out = child.stdout.take().ok_or("Missing stdout")?;
    let err = child.stderr.take().ok_or("Missing stderr")?;
    let read = |mut stream: Box<dyn Read + Send>| {
        thread::spawn(move || {
            let mut all = Vec::new();
            let mut b = [0; 8192];
            while let Ok(n) = stream.read(&mut b) {
                if n == 0 {
                    break;
                }
                if all.len() < 4_000_000 {
                    let take = n.min(4_000_000 - all.len());
                    all.extend_from_slice(&b[..take]);
                }
            }
            String::from_utf8_lossy(&all).into_owned()
        })
    };
    let stdout = read(Box::new(out));
    let stderr = read(Box::new(err));
    let start = Instant::now();
    let status = loop {
        if let Some(s) = child.try_wait().map_err(|e| e.to_string())? {
            break s;
        }
        if start.elapsed() > Duration::from_secs(seconds) {
            unsafe {
                libc::kill(-(child.id() as i32), libc::SIGKILL);
            }
            let _ = child.wait();
            return Err(format!("Command timed out after {seconds}s"));
        }
        thread::sleep(Duration::from_millis(30));
    };
    // Reap stray pipe holders as well; the command itself has completed.
    unsafe {
        libc::kill(-(child.id() as i32), libc::SIGKILL);
    }
    Ok((
        status.success(),
        stdout.join().unwrap_or_default(),
        stderr.join().unwrap_or_default(),
    ))
}
/// Local inspection must not authorize executable repository configuration.
/// Reviewed jobs use Plan::command instead and retain normal Git extensions.
pub fn git(path: &Path, args: &[&str]) -> Result<String, String> {
    let mut command = Command::new("git");
    command
        .arg("-C")
        .arg(path)
        .args([
            "-c",
            "core.fsmonitor=false",
            "-c",
            "core.hooksPath=/dev/null",
            "-c",
            "log.showSignature=false",
            "-c",
            "diff.submodule=short",
        ])
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_OPTIONAL_LOCKS", "0")
        .env("GIT_NO_LAZY_FETCH", "1")
        .env("GIT_ALLOW_PROTOCOL", "");
    // Status/diff may invoke clean or long-running process filters. Enumerate
    // effective keys (including includes/worktree config), without running them.
    let (ok, keys, err) = output(
        Command::new("git").arg("-C").arg(path).args([
            "config",
            "--includes",
            "--null",
            "--name-only",
            "--list",
        ]),
        15,
    )?;
    if !ok {
        return Err(err.trim().to_string());
    }
    if keys.len() >= 4_000_000
        || keys.contains('\u{fffd}')
        || (!keys.is_empty() && !keys.ends_with('\0'))
    {
        return Err("Cannot safely inspect Git configuration; use the repository terminal".into());
    }
    let mut filters = std::collections::BTreeSet::new();
    for key in keys.split_terminator('\0') {
        if let Some(rest) = key.strip_prefix("filter.") {
            if let Some((name, _)) = rest.rsplit_once('.') {
                filters.insert(name);
            }
        }
    }
    if filters.len() > 1024 || filters.iter().any(|name| name.contains('=')) {
        return Err("Unsupported Git filter configuration; use the repository terminal".into());
    }
    for name in filters {
        for setting in ["clean=", "smudge=", "process=", "required=false"] {
            command.arg("-c").arg(format!("filter.{name}.{setting}"));
        }
    }
    if let Some((subcommand, rest)) = args.split_first() {
        command.arg(subcommand);
        // A nested worktree has its own filters. Report gitlink changes without
        // recursively inspecting unreviewed submodule working files.
        if matches!(*subcommand, "status" | "diff") {
            command.arg("--ignore-submodules=dirty");
        }
        if *subcommand == "diff" {
            command.args(["--no-ext-diff", "--no-textconv"]);
        }
        command.args(rest);
    }
    let (ok, out, err) = output(&mut command, 15)?;
    if ok {
        Ok(out)
    } else {
        Err(err.trim().to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture_git(path: &Path, args: &[&str]) {
        let result = Command::new("git")
            .arg("-C")
            .arg(path)
            .args(args)
            .output()
            .unwrap();
        assert!(
            result.status.success(),
            "{}",
            String::from_utf8_lossy(&result.stderr)
        );
    }
    fn fixture_head(path: &Path, tree: &str, signature: &str) {
        use std::io::Write;
        let commit = format!("tree {tree}\nauthor Fixture <fixture@example.invalid> 1 +0000\ncommitter Fixture <fixture@example.invalid> 1 +0000\n{signature}\nmessage\n");
        let mut child = Command::new("git")
            .arg("-C")
            .arg(path)
            .args(["hash-object", "-t", "commit", "-w", "--stdin"])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .spawn()
            .unwrap();
        child
            .stdin
            .take()
            .unwrap()
            .write_all(commit.as_bytes())
            .unwrap();
        let result = child.wait_with_output().unwrap();
        assert!(result.status.success());
        fixture_git(
            path,
            &[
                "update-ref",
                "HEAD",
                String::from_utf8_lossy(&result.stdout).trim(),
            ],
        );
    }
    #[test]
    fn passive_git_blocks_signature_verifiers_and_promisor_transports() {
        use std::os::unix::fs::PermissionsExt;
        for kind in ["signature", "promisor"] {
            let dir = tempfile::tempdir().unwrap();
            let path = dir.path();
            fixture_git(path, &["init"]);
            let marker = path.join("extension-ran");
            let hook = path.join("probe-hook");
            fs::write(
                &hook,
                format!("#!/bin/sh\ntouch '{}'\nexit 1\n", marker.display()),
            )
            .unwrap();
            fs::set_permissions(&hook, fs::Permissions::from_mode(0o700)).unwrap();
            let args: &[&str] = if kind == "signature" {
                fixture_git(path, &["config", "log.showSignature", "true"]);
                fixture_git(path, &["config", "gpg.program", hook.to_str().unwrap()]);
                let tree = Command::new("git")
                    .arg("-C")
                    .arg(path)
                    .arg("mktree")
                    .stdin(Stdio::null())
                    .output()
                    .unwrap();
                assert!(tree.status.success());
                fixture_head(path, String::from_utf8_lossy(&tree.stdout).trim(), "gpgsig -----BEGIN PGP SIGNATURE-----\n \n invalid\n -----END PGP SIGNATURE-----\n");
                &["log", "-1", "--format=%s"]
            } else {
                fixture_head(path, &"1".repeat(40), "");
                for (key, value) in [
                    ("core.repositoryformatversion", "1"),
                    ("extensions.partialClone", "origin"),
                    ("remote.origin.promisor", "true"),
                    ("remote.origin.url", path.to_str().unwrap()),
                    ("remote.origin.uploadpack", hook.to_str().unwrap()),
                ] {
                    fixture_git(path, &["config", key, value]);
                }
                &["status", "--porcelain"]
            };
            // Positive attack control: ordinary Git executes this fixture.
            let _ = Command::new("git")
                .arg("-C")
                .arg(path)
                .args(args)
                .output()
                .unwrap();
            assert!(marker.exists(), "{kind} fixture did not execute");
            fs::remove_file(&marker).unwrap();
            let result = git(path, args);
            assert!(
                !marker.exists(),
                "{kind} executed during passive inspection"
            );
            if kind == "signature" {
                assert_eq!(result.unwrap().trim(), "message");
            } else {
                assert!(
                    result.is_err(),
                    "missing objects must make inspection unavailable"
                );
            }
        }
    }
    #[test]
    fn passive_git_does_not_run_fsmonitor_hooks_or_content_filters() {
        use std::os::unix::fs::PermissionsExt;
        for extension in [
            "fsmonitor",
            "post-index-change",
            "clean",
            "process",
            "textconv",
            "external-diff",
            "included-filter",
        ] {
            let dir = tempfile::tempdir().unwrap();
            let path = dir.path();
            fixture_git(path, &["init", "-b", "main"]);
            fs::write(path.join("tracked"), "original\n").unwrap();
            fixture_git(path, &["add", "tracked"]);
            let hook = path.join("probe-hook");
            fs::write(&hook, "#!/bin/sh\ntouch extension-ran\nexit 1\n").unwrap();
            fs::set_permissions(&hook, fs::Permissions::from_mode(0o700)).unwrap();
            match extension {
                "fsmonitor" => {
                    fixture_git(path, &["config", "core.fsmonitor", hook.to_str().unwrap()])
                }
                "post-index-change" => {
                    fs::rename(&hook, path.join(".git/hooks/post-index-change")).unwrap();
                    // Force a refresh of index metadata.
                    fs::write(path.join("tracked"), "original\n").unwrap();
                }
                "textconv" => {
                    fs::write(path.join(".gitattributes"), "tracked diff=fixture\n").unwrap();
                    fixture_git(
                        path,
                        &["config", "diff.fixture.textconv", hook.to_str().unwrap()],
                    );
                    fs::write(path.join("tracked"), "changed contents\n").unwrap();
                }
                "external-diff" => {
                    fixture_git(path, &["config", "diff.external", hook.to_str().unwrap()]);
                    fs::write(path.join("tracked"), "changed contents\n").unwrap();
                }
                "included-filter" => {
                    fs::write(path.join(".gitattributes"), "tracked filter=Mixed.case\n").unwrap();
                    fs::write(
                        path.join(".git/extra-config"),
                        format!(
                            "[filter \"Mixed.case\"]\nclean = {}\nrequired = true\n",
                            hook.display()
                        ),
                    )
                    .unwrap();
                    fixture_git(path, &["config", "include.path", "extra-config"]);
                    fs::write(path.join("tracked"), "changed contents\n").unwrap();
                }
                field => {
                    fs::write(path.join(".gitattributes"), "tracked filter=fixture\n").unwrap();
                    fixture_git(
                        path,
                        &[
                            "config",
                            &format!("filter.fixture.{field}"),
                            hook.to_str().unwrap(),
                        ],
                    );
                    fixture_git(path, &["config", "filter.fixture.required", "true"]);
                    fs::write(path.join("tracked"), "changed contents\n").unwrap();
                }
            }
            let status = git(path, &["status", "--porcelain"]);
            assert!(!path.join("extension-ran").exists(), "{extension} executed");
            assert!(status.is_ok(), "{extension}: {status:?}");
            git(path, &["diff"]).unwrap();
            assert!(
                !path.join("extension-ran").exists(),
                "{extension} executed during diff"
            );
        }
    }
    #[test]
    fn passive_git_skips_nested_filters_but_reports_changed_submodule_commits() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path();
        fixture_git(path, &["init"]);
        let child = path.join("child");
        fs::create_dir(&child).unwrap();
        fixture_git(&child, &["init"]);
        fs::write(child.join("tracked"), "original\n").unwrap();
        fixture_git(&child, &["add", "tracked"]);
        fixture_git(
            &child,
            &[
                "-c",
                "user.name=Fixture",
                "-c",
                "user.email=fixture@example.invalid",
                "-c",
                "commit.gpgsign=false",
                "commit",
                "-m",
                "initial",
            ],
        );
        fixture_git(path, &["add", "child"]);
        let hook = child.join("filter-hook");
        fs::write(&hook, "#!/bin/sh\ntouch nested-filter-ran\ncat\n").unwrap();
        fs::set_permissions(&hook, fs::Permissions::from_mode(0o700)).unwrap();
        fs::write(child.join(".gitattributes"), "tracked filter=nested\n").unwrap();
        fixture_git(
            &child,
            &["config", "filter.nested.clean", hook.to_str().unwrap()],
        );
        fs::write(child.join("tracked"), "modified\n").unwrap();
        git(path, &["status", "--porcelain"]).unwrap();
        git(path, &["diff"]).unwrap();
        assert!(!child.join("nested-filter-ran").exists());
        fixture_git(path, &["config", "diff.submodule", "diff"]);
        fixture_git(
            &child,
            &["config", "diff.fixture.textconv", hook.to_str().unwrap()],
        );
        fs::write(
            child.join(".gitattributes"),
            "tracked filter=nested diff=fixture\n",
        )
        .unwrap();
        fixture_git(&child, &["add", "tracked", ".gitattributes"]);
        // An explicit action in the child can change its commit; inspection of
        // the parent still sees that gitlink change without scanning child files.
        fixture_git(
            &child,
            &[
                "-c",
                "user.name=Fixture",
                "-c",
                "user.email=fixture@example.invalid",
                "-c",
                "commit.gpgsign=false",
                "commit",
                "--allow-empty",
                "-m",
                "next",
            ],
        );
        let _ = fs::remove_file(child.join("nested-filter-ran"));
        fixture_git(
            path,
            &[
                "diff",
                "--no-ext-diff",
                "--no-textconv",
                "--ignore-submodules=dirty",
            ],
        );
        assert!(
            child.join("nested-filter-ran").exists(),
            "nested textconv fixture did not execute"
        );
        fs::remove_file(child.join("nested-filter-ran")).unwrap();
        let status = git(path, &["status", "--porcelain"]).unwrap();
        git(path, &["diff"]).unwrap();
        assert!(status.contains("AM child"), "{status}");
        assert!(!child.join("nested-filter-ran").exists());
    }
    #[test]
    fn timeout_stops_commands_without_waiting_for_inherited_pipes() {
        let start = Instant::now();
        let result = output(Command::new("sh").args(["-c", "sleep 30 & wait"]), 1);
        assert!(result.unwrap_err().contains("timed out"));
        assert!(start.elapsed() < Duration::from_secs(3));
    }
    #[test]
    fn captures_stdout_stderr_and_exit_status() {
        let (ok, out, err) = output(
            Command::new("sh").args(["-c", "printf output; printf failure >&2; exit 7"]),
            2,
        )
        .unwrap();
        assert!(!ok);
        assert_eq!(out, "output");
        assert_eq!(err, "failure");
    }
    #[test]
    fn atomic_save_leaves_parseable_private_data() {
        use std::os::unix::fs::PermissionsExt;
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("settings.json");
        save(&path, &vec!["first"]).unwrap();
        save(&path, &vec!["second"]).unwrap();
        assert_eq!(load::<Vec<String>>(&path).unwrap(), vec!["second"]);
        assert_eq!(
            fs::metadata(path).unwrap().permissions().mode() & 0o777,
            0o600
        );
    }
}
