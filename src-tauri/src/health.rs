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
fn backup_report(s: &Settings) -> Value {
    if s.integrations.backup_health_script.is_empty() {
        return json!({"available":false,"error":"Configure your backup health helper in Settings"});
    }
    match p::expand(&s.integrations.backup_health_script)
        .and_then(|path| p::output(Command::new(path).arg("--json"), 30))
    {
        Ok((_, out, err)) => match serde_json::from_str::<Value>(&out) {
            Ok(data) => json!({"available":true,"data":data}),
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
    let readiness = json!([
        {"label":"Dotfiles working tree","ready":dotfiles.as_ref().is_some_and(|p|p.join(".git").exists()),"detail":i.dotfiles_path},
        {"label":"Home Manager flake","ready":dotfiles.as_ref().is_some_and(|p|p.join("home-manager/flake.nix").exists()||p.join("flake.nix").exists()),"detail":i.flake_profile},
        {"label":"Backup location","ready":backup["data"]["drive_mounted"].as_bool().unwrap_or(false),"detail":i.restic_repository},
        {"label":"Encrypted recovery files","ready":encrypted>0,"detail":format!("{encrypted} encrypted files found; decryptability not tested")},
        {"label":"Recovery instructions","ready":exists(&i.recovery_notes_path),"detail":i.recovery_notes_path}
    ]);
    json!({"backupHelpers":helpers,"checkedAt":p::now(),"disk":disk,"userServices":user_services,"systemServices":system_services,"updates":updates,"batteries":batteries,"backup":backup,"readiness":readiness,
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
