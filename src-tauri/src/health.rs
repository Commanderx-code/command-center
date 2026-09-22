use crate::{platform as p, settings::Settings};
use serde_json::{json, Value};
use std::{fs, process::Command};
fn probe(command: &mut Command) -> Value {
    match p::output(command, 15) {
        Ok((ok, out, err)) => {
            json!({"available":ok,"output":out,"error":if ok{String::new()}else{err}})
        }
        Err(e) => json!({"available":false,"output":"","error":e}),
    }
}
pub(crate) fn backup_report(s: &Settings) -> Value {
    if s.integrations.backup_health_script.is_empty() {
        return json!({"available":false,"error":"Configure your backup health helper in Settings"});
    }
    match p::expand(&s.integrations.backup_health_script)
        .and_then(|path| p::output(Command::new(path).arg("--json"), 30))
    {
        Ok((ok, out, err)) => match serde_json::from_str::<Value>(&out) {
            Ok(data) if data.is_object() => json!({"available":ok,"data":data,"error":if ok {String::new()}else{format!("Backup health helper failed: {err}")}}),
            Ok(_) => json!({"available":false,"error":"Backup helper JSON must be an object"}),
            Err(_) => {
                json!({"available":false,"error":format!("Backup helper did not return JSON: {err}")})
            }
        },
        Err(e) => json!({"available":false,"error":e}),
    }
}
fn collect(s: Settings) -> Value {
    let disk = probe(Command::new("df").args(["-hP", "/", &p::home().to_string_lossy()]));
    let user_services = probe(Command::new("systemctl").args([
        "--user",
        "--failed",
        "--no-pager",
        "--no-legend",
        "--plain",
    ]));
    let system_services =
        probe(Command::new("systemctl").args(["--failed", "--no-pager", "--no-legend", "--plain"]));
    let updates = if p::available("pacman") {
        match p::output(Command::new("pacman").arg("-Qu"), 15) {
            Ok((ok, out, err)) if ok || err.trim().is_empty() => {
                json!({"available":true,"output":out,"error":""})
            }
            Ok((_, _, err)) => json!({"available":false,"error":err}),
            Err(e) => json!({"available":false,"error":e}),
        }
    } else {
        json!({"available":false,"error":"Cached update inventory is available on Arch-based systems"})
    };
    let mut batteries = Vec::new();
    if let Ok(entries) = fs::read_dir("/sys/class/power_supply") {
        for entry in entries.flatten() {
            let path = entry.path();
            if fs::read_to_string(path.join("type"))
                .unwrap_or_default()
                .trim()
                == "Battery"
            {
                let read = |name| {
                    fs::read_to_string(path.join(name))
                        .unwrap_or_default()
                        .trim()
                        .to_owned()
                };
                batteries.push(json!({"name":entry.file_name().to_string_lossy(),"capacity":read("capacity"),"status":read("status"),"energyFull":read("energy_full"),"energyDesign":read("energy_full_design")}));
            }
        }
    }
    let backup = backup_report(&s);
    let i = &s.integrations;
    let exists = |value: &str| p::expand(value).map(|p| p.exists()).unwrap_or(false);
    let dotfiles = p::expand(&i.dotfiles_path).ok();
    let encrypted = p::expand(&i.secrets_directory)
        .ok()
        .and_then(|path| fs::read_dir(path).ok())
        .map(|entries| {
            entries
                .flatten()
                .filter(|e| {
                    e.path()
                        .extension()
                        .is_some_and(|ext| ext == "gpg" || ext == "age")
                })
                .count()
        })
        .unwrap_or(0);
    let executable = |value: &str| {
        use std::os::unix::fs::PermissionsExt;
        p::expand(value).ok().and_then(|path| fs::metadata(path).ok()).is_some_and(|m| m.is_file() && m.permissions().mode() & 0o111 != 0)
    };
    let helpers = json!({"personal":executable(&i.backup_script),"full":executable(&i.full_backup_script)});
    let local = i.restic_repository.starts_with('/') || i.restic_repository.starts_with("~/");
    let location = if i.restic_repository.is_empty() { "Not configured" }
        else if !local { "Remote repository; connection not tested" }
        else if backup["available"]==true && backup["data"]["drive_mounted"]==true { "Mounted according to backup helper" }
        else if backup["data"]["drive_mounted"]==false { "Disconnected according to backup helper" }
        else { "Mount status unknown; refresh or configure the health helper" };
    let credential = if !i.restic_password_file.is_empty() {
        if p::expand(&i.restic_password_file).ok().is_some_and(|path|path.is_file() && fs::File::open(path).is_ok()) { "Password file readable; authentication not tested" }
        else { "Password file unavailable or unreadable" }
    } else if !i.wallet.is_empty() && !i.wallet_entry.is_empty() {
        if p::available("kwallet-query") { "KWallet configured; unlock and entry access not tested" }
        else { "KWallet configured but kwallet-query is unavailable" }
    } else if std::env::var_os("RESTIC_PASSWORD").is_some() || std::env::var_os("RESTIC_PASSWORD_FILE").is_some() || std::env::var_os("RESTIC_PASSWORD_COMMAND").is_some() {
        "Environment credential source configured; access not tested"
    } else { "No credential source configured for Restic browsing" };
    let backup_readiness=json!({"location":location,"credentials":credential,"resticAvailable":p::available("restic"),"healthAvailable":backup["available"],"healthError":backup["error"]});
    let readiness = json!([
        {"label":"Dotfiles working tree","ready":dotfiles.as_ref().is_some_and(|p|p.join(".git").exists()),"detail":i.dotfiles_path},
        {"label":"Home Manager flake","ready":dotfiles.as_ref().is_some_and(|p|p.join("home-manager/flake.nix").exists()||p.join("flake.nix").exists()),"detail":i.flake_profile},
        {"label":"Backup location","ready":backup["data"]["drive_mounted"].as_bool().unwrap_or(false),"detail":i.restic_repository},
        {"label":"Encrypted recovery files","ready":encrypted>0,"detail":format!("{encrypted} encrypted files found; decryptability not tested")},
        {"label":"Recovery instructions","ready":exists(&i.recovery_notes_path),"detail":i.recovery_notes_path}
    ]);
    json!({"backupReadiness":backup_readiness,"backupHelpers":helpers,"checkedAt":p::now(),"disk":disk,"userServices":user_services,"systemServices":system_services,"updates":updates,"batteries":batteries,"backup":backup,"readiness":readiness,
        "tools":(["git","home-manager","restic","ghostty","fastfetch"].map(|name|json!({"name":name,"available":p::available(name)})))})
}
#[tauri::command]
pub async fn system_health(app: tauri::AppHandle) -> Result<Value, String> {
    let s = crate::settings::load_settings(app)?.unwrap_or_default();
    tauri::async_runtime::spawn_blocking(move || Ok(collect(s)))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
pub fn recovery_notes(app: tauri::AppHandle) -> Result<String, String> {
    let s = crate::settings::load_settings(app)?.unwrap_or_default();
    let path = p::expand(&s.integrations.recovery_notes_path)?;
    let text = fs::read_to_string(path).map_err(|e| e.to_string())?;
    if text.len() > 256_000 {
        return Err("Recovery notes exceed 256 KB; open them in your editor".into());
    }
    Ok(text)
}

#[cfg(test)]
mod readiness_tests {
    use super::*;
    use std::os::unix::fs::PermissionsExt;
    #[test]
    fn failed_health_exit_is_not_success_and_disconnected_report_blocks_backup() {
        let temp=tempfile::tempdir().unwrap();
        let script=temp.path().join("health");
        fs::write(&script,"#!/bin/sh\nprintf '%s' '{\"drive_mounted\":false}'\nexit 1\n").unwrap();
        fs::set_permissions(&script,fs::Permissions::from_mode(0o700)).unwrap();
        let mut settings=Settings::default();
        settings.integrations.backup_health_script=script.to_string_lossy().into_owned();
        let report=backup_report(&settings);
        assert_eq!(report["available"],false);
        assert_eq!(report["data"]["drive_mounted"],false);
        let request=crate::integrations::Request{action:"backup".into(),..Default::default()};
        let result=crate::integrations::build_plan(&request,&settings);
        assert!(matches!(result,Err(message) if message.contains("disconnected")));
    }
    #[test]
    fn access_test_uses_read_only_config_command_and_bounded_timeout(){
        let temp=tempfile::tempdir().unwrap();
        let password=temp.path().join("password");fs::write(&password,"fixture").unwrap();
        let mut settings=Settings::default();settings.integrations.restic_repository=temp.path().join("repo").to_string_lossy().into_owned();
        settings.integrations.restic_password_file=password.to_string_lossy().into_owned();
        let request=crate::integrations::Request{action:"restic-access".into(),..Default::default()};
        let plan=crate::integrations::build_plan(&request,&settings).unwrap();
        assert_eq!(&plan.args[plan.args.len()-2..],&["cat","config"]);
        assert_eq!(plan.timeout_seconds,120);
    }
}
