use crate::{platform as p, settings::Integrations};
use serde::Serialize;
use std::{fs, os::unix::fs::PermissionsExt};

#[derive(Serialize)]
pub struct Check {
    label: String,
    status: &'static str,
    message: String,
}
fn result(label: &str, status: &'static str, message: &str) -> Check {
    Check { label: label.into(), status, message: message.into() }
}
fn path_check(label: &str, value: &str, kind: &str) -> Check {
    if value.is_empty() { return result(label, "unknown", "Not configured"); }
    let path = match p::expand(value) {
        Ok(path) => path,
        Err(error) => return result(label, "missing", &error),
    };
    let metadata = match fs::metadata(&path) {
        Ok(metadata) => metadata,
        Err(error) => return result(label, "missing", &format!("Unavailable: {error}")),
    };
    let valid = match kind {
        "directory" => metadata.is_dir(),
        "script" => metadata.is_file() && metadata.permissions().mode() & 0o111 != 0,
        "repository" => metadata.is_dir() && path.join(".git").exists(),
        _ => metadata.is_file(),
    };
    if !valid { return result(label, "missing", &format!("Expected {kind}")); }
    if kind == "source" && path.canonicalize().map(|p| p.starts_with("/nix/store")).unwrap_or(false) {
        return result(label, "missing", "Nix-managed file: choose the editable source");
    }
    result(label, "available", "Present (access at execution may differ)")
}
fn executable(name: &str) -> bool {
    std::env::var_os("PATH").map(|paths| std::env::split_paths(&paths).any(|dir| {
        fs::metadata(dir.join(name)).map(|m| m.is_file() && m.permissions().mode() & 0o111 != 0).unwrap_or(false)
    })).unwrap_or(false)
}
fn inspect(i: Integrations) -> Result<Vec<Check>, String> {
    i.validate()?;
    let mut checks = Vec::new();
    for (label, value, kind) in [
        ("Dotfiles repository", &i.dotfiles_path, "repository"),
        ("Personal backup helper", &i.backup_script, "script"),
        ("Full backup helper", &i.full_backup_script, "script"),
        ("Backup health helper", &i.backup_health_script, "script"),
        ("Restic password file", &i.restic_password_file, "file"),
        ("Ghostty source", &i.ghostty_source, "source"),
        ("Fastfetch source", &i.fastfetch_source, "source"),
        ("Recovery notes", &i.recovery_notes_path, "file"),
        ("Encrypted secrets directory", &i.secrets_directory, "directory"),
    ] { checks.push(path_check(label, value, kind)); }
    if i.restic_repository.starts_with('/') || i.restic_repository.starts_with("~/") {
        checks.push(path_check("Restic repository folder", &i.restic_repository, "directory"));
    } else {
        checks.push(result("Restic repository", "unknown", if i.restic_repository.is_empty() { "Not configured" } else { "Remote address configured; connection not tested" }));
    }
    let flake = p::expand(&i.dotfiles_path).ok().is_some_and(|path| path.join("flake.nix").is_file() || path.join("home-manager/flake.nix").is_file());
    checks.push(result("Home Manager flake", if flake { "available" } else { "missing" }, if flake { "Found; profile evaluation not tested" } else { "No flake.nix found in repository or home-manager/" }));
    for tool in ["git", "nix", "home-manager", "restic", "ghostty", "fastfetch", "kwallet-query"] {
        let found = executable(tool);
        checks.push(result(tool, if found { "available" } else { "missing" }, if found { "Executable found on PATH" } else { "Not found on PATH" }));
    }
    Ok(checks)
}
#[tauri::command]
pub async fn check_integrations(integrations: Integrations) -> Result<Vec<Check>, String> {
    tauri::async_runtime::spawn_blocking(move || inspect(integrations)).await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn checks_type_and_execute_bits_without_running_scripts() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("helper");
        fs::write(&file, "this is not an executable program").unwrap();
        fs::set_permissions(&file, fs::Permissions::from_mode(0o600)).unwrap();
        assert_eq!(path_check("helper", file.to_str().unwrap(), "script").status, "missing");
        fs::set_permissions(&file, fs::Permissions::from_mode(0o700)).unwrap();
        assert_eq!(path_check("helper", file.to_str().unwrap(), "script").status, "available");
        assert_eq!(path_check("folder", file.to_str().unwrap(), "directory").status, "missing");
        assert_eq!(path_check("unset", "", "file").status, "unknown");
    }
}
