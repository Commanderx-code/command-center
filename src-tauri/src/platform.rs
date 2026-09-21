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
pub fn git(path: &Path, args: &[&str]) -> Result<String, String> {
    let (ok, out, err) = output(
        Command::new("git")
            .arg("-C")
            .arg(path)
            .args(args)
            .env("GIT_TERMINAL_PROMPT", "0"),
        15,
    )?;
    if ok {
        Ok(out)
    } else {
        Err(err.trim().to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
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
