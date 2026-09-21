use crate::{platform as p, settings::Settings};
use serde::Serialize;
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
    sync::Mutex,
};
static LOCK: Mutex<()> = Mutex::new(());
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Document {
    pub kind: String,
    pub path: String,
    pub live_path: String,
    pub managed: bool,
    pub content: String,
    pub revision: String,
    pub exists: bool,
}
fn fingerprint(text: &str) -> String {
    use std::hash::{Hash, Hasher};
    let mut h = std::collections::hash_map::DefaultHasher::new();
    text.hash(&mut h);
    format!("{:x}", h.finish())
}
fn paths(kind: &str, s: &Settings) -> Result<(PathBuf, PathBuf, bool), String> {
    let (app, file, source) = match kind {
        "ghostty" => ("ghostty", "config", &s.integrations.ghostty_source),
        "fastfetch" => (
            "fastfetch",
            "config.jsonc",
            &s.integrations.fastfetch_source,
        ),
        _ => return Err("Unknown configuration editor".into()),
    };
    let live = p::config_home().join(app).join(file);
    let managed = live
        .canonicalize()
        .map(|v| v.starts_with("/nix/store"))
        .unwrap_or(false);
    let chosen = if source.is_empty() {
        live.clone()
    } else {
        p::expand(source)?
    };
    if chosen
        .components()
        .any(|part| matches!(part, std::path::Component::ParentDir))
    {
        return Err("Configuration paths cannot contain ..".into());
    }
    let actual = if fs::symlink_metadata(&chosen).is_ok() {
        chosen
            .canonicalize()
            .map_err(|e| format!("Cannot resolve configuration source: {e}"))?
    } else {
        let ancestor = chosen
            .ancestors()
            .skip(1)
            .find(|p| p.exists())
            .ok_or("No existing source directory")?;
        let resolved = ancestor.canonicalize().map_err(|e| e.to_string())?;
        resolved.join(chosen.strip_prefix(ancestor).map_err(|e| e.to_string())?)
    };
    if actual.starts_with("/nix/store") {
        return Err(
            "This file is managed by Home Manager. Set its editable source path in Settings."
                .into(),
        );
    }
    if !actual.starts_with(p::home().canonicalize().map_err(|e| e.to_string())?) {
        return Err("Configuration sources must be inside your home directory".into());
    }
    Ok((actual, live, managed))
}
fn read(path: &Path) -> Result<(String, bool), String> {
    match fs::read_to_string(path) {
        Ok(v) if v.len() <= 512_000 => Ok((v, true)),
        Ok(_) => Err("Configuration is too large for this editor".into()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok((String::new(), false)),
        Err(e) => Err(e.to_string()),
    }
}
#[tauri::command]
pub fn load_configuration(app: tauri::AppHandle, kind: String) -> Result<Document, String> {
    let s = crate::settings::load_settings(app)?.unwrap_or_default();
    let (path, live, managed) = paths(&kind, &s)?;
    let (content, exists) = read(&path)?;
    Ok(Document {
        kind,
        path: path.to_string_lossy().into_owned(),
        live_path: live.to_string_lossy().into_owned(),
        managed,
        revision: fingerprint(&content),
        content,
        exists,
    })
}
// JSONC permits comments and trailing commas. Preserve strings and byte positions.
pub fn parse_jsonc(text: &str) -> Result<serde_json::Value, String> {
    let mut bytes = text.as_bytes().to_vec();
    let mut i = 0;
    let mut string = false;
    let mut escaped = false;
    while i < bytes.len() {
        let b = bytes[i];
        if string {
            if escaped {
                escaped = false;
            } else if b == b'\\' {
                escaped = true;
            } else if b == b'"' {
                string = false;
            }
            i += 1;
            continue;
        }
        if b == b'"' {
            string = true;
            i += 1;
            continue;
        }
        if b == b'/' && i + 1 < bytes.len() {
            if bytes[i + 1] == b'/' {
                bytes[i] = b' ';
                bytes[i + 1] = b' ';
                i += 2;
                while i < bytes.len() && bytes[i] != b'\n' {
                    bytes[i] = b' ';
                    i += 1;
                }
                continue;
            }
            if bytes[i + 1] == b'*' {
                bytes[i] = b' ';
                bytes[i + 1] = b' ';
                i += 2;
                let mut closed = false;
                while i < bytes.len() {
                    if i + 1 < bytes.len() && bytes[i] == b'*' && bytes[i + 1] == b'/' {
                        bytes[i] = b' ';
                        bytes[i + 1] = b' ';
                        i += 2;
                        closed = true;
                        break;
                    }
                    if bytes[i] != b'\n' {
                        bytes[i] = b' ';
                    }
                    i += 1;
                }
                if !closed {
                    return Err("Unterminated JSON comment".into());
                }
                continue;
            }
        }
        i += 1;
    }
    string = false;
    escaped = false;
    i = 0;
    while i < bytes.len() {
        let b = bytes[i];
        if string {
            if escaped {
                escaped = false;
            } else if b == b'\\' {
                escaped = true;
            } else if b == b'"' {
                string = false;
            }
        } else if b == b'"' {
            string = true;
        } else if b == b',' {
            let mut j = i + 1;
            while j < bytes.len() && bytes[j].is_ascii_whitespace() {
                j += 1;
            }
            if j < bytes.len() && (bytes[j] == b'}' || bytes[j] == b']') {
                let previous = bytes[..i].iter().rev().find(|b| !b.is_ascii_whitespace());
                if previous.is_some_and(|b| *b != b'{' && *b != b'[' && *b != b',') {
                    bytes[i] = b' ';
                }
            }
        }
        i += 1;
    }
    serde_json::from_slice(&bytes).map_err(|e| e.to_string())
}
fn validate(kind: &str, content: &str, dir: &Path) -> Result<(), String> {
    if content.len() > 512_000 || content.contains('\0') {
        return Err("Invalid or oversized configuration".into());
    }
    if kind == "fastfetch" {
        let data = parse_jsonc(content)?;
        if !data.is_object() {
            return Err("Fastfetch configuration must be an object".into());
        }
        if let Some(modules) = data.get("modules") {
            let modules = modules.as_array().ok_or("Modules must be an array")?;
            for m in modules {
                if !(m.is_string() || m.get("type").is_some_and(|v| v.is_string())) {
                    return Err("Each module needs a type".into());
                }
            }
        }
        return Ok(());
    }
    if !p::available("ghostty") {
        return Err("Install Ghostty to validate its configuration before saving".into());
    }
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let temp = dir.join(format!("ghostty-{}.conf", p::now()));
    p::atomic_write(&temp, content.as_bytes())?;
    let result = p::output(
        Command::new("ghostty")
            .arg("+validate-config")
            .arg(format!("--config-file={}", temp.display())),
        15,
    );
    let _ = fs::remove_file(temp);
    let (ok, out, err) = result?;
    if !ok {
        return Err(format!("Ghostty rejected this configuration:\n{out}{err}"));
    }
    Ok(())
}
#[tauri::command]
pub async fn validate_configuration(
    app: tauri::AppHandle,
    kind: String,
    content: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        if !["ghostty", "fastfetch"].contains(&kind.as_str()) {
            return Err("Unknown editor".into());
        }
        validate(&kind, &content, &p::data_file(&app, "previews")?)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn save_configuration(
    app: tauri::AppHandle,
    kind: String,
    content: String,
    revision: String,
    expected_path: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = LOCK.lock().map_err(|e| e.to_string())?;
        let s = crate::settings::load_settings(app.clone())?.unwrap_or_default();
        let (path, _, _) = paths(&kind, &s)?;
        if path.to_string_lossy() != expected_path {
            return Err("Configuration source changed; reload before saving".into());
        }
        write_configuration(&path, &kind, &content, &revision, &p::data_file(&app, "")?)
    })
    .await
    .map_err(|e| e.to_string())?
}
fn write_configuration(
    path: &Path,
    kind: &str,
    content: &str,
    revision: &str,
    data_dir: &Path,
) -> Result<String, String> {
    let (old, exists) = read(path)?;
    if fingerprint(&old) != revision {
        return Err("This file changed outside Command Center. Reload it before saving.".into());
    }
    validate(kind, content, &data_dir.join("previews"))?;
    let backup = data_dir.join(format!("config-backups/{kind}-{}.bak", p::now()));
    if exists {
        p::atomic_write(&backup, old.as_bytes())?;
    }
    // Recheck after validation, which may take several seconds.
    if read(path)?.0 != old {
        return Err("File changed during validation; reload before saving".into());
    }
    let permissions = fs::metadata(path).ok().map(|m| m.permissions());
    p::atomic_write(path, content.as_bytes())?;
    if let Some(permissions) = permissions {
        fs::set_permissions(path, permissions).map_err(|e| e.to_string())?;
    }
    Ok(if exists {
        format!("Saved. Previous version: {}", backup.display())
    } else {
        "Configuration created.".into()
    })
}

pub fn drift(settings: &Settings) -> Vec<serde_json::Value> {
    ["ghostty","fastfetch"].iter().map(|kind| {
        match paths(kind, settings) {
            Ok((source,live,managed)) => {
                let current=fs::read(&live);let desired=fs::read(&source);
                let status=match (&current,&desired) { (Ok(a),Ok(b)) if a==b=>"matches",(Ok(_),Ok(_))=>"differs",_=>"unavailable" };
                serde_json::json!({"name":kind,"managed":managed,"source":source,"live":live,"status":status})
            },
            Err(error)=>serde_json::json!({"name":kind,"status":"unavailable","error":error})
        }
    }).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn jsonc_handles_comments_trailing_commas_and_urls() {
        let v = parse_jsonc(
            "{/* comment */\"url\":\"https://example.org/a,b\",\"modules\":[\"os\",],//hi\n}",
        )
        .unwrap();
        assert_eq!(v["url"], "https://example.org/a,b");
        assert_eq!(v["modules"][0], "os");
    }
    #[test]
    fn malformed_comments_are_rejected() {
        assert!(parse_jsonc("{/* no end").is_err());
        assert!(parse_jsonc("{,}").is_err());
    }
}

#[cfg(test)]
mod save_tests {
    use super::*;
    #[test]
    fn save_preserves_backup_and_refuses_stale_revision() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("config.jsonc");
        let original = "{\"modules\":[\"os\"]}";
        fs::write(&path, original).unwrap();
        let data = temp.path().join("app");
        let revision = fingerprint(original);
        let result = write_configuration(
            &path,
            "fastfetch",
            "{\"modules\":[\"kernel\"]}",
            &revision,
            &data,
        )
        .unwrap();
        assert!(result.starts_with("Saved."));
        let backup = fs::read_dir(data.join("config-backups"))
            .unwrap()
            .next()
            .unwrap()
            .unwrap()
            .path();
        assert_eq!(fs::read_to_string(backup).unwrap(), original);
        assert!(
            write_configuration(&path, "fastfetch", "{}", &revision, &data)
                .unwrap_err()
                .contains("changed outside")
        );
        assert!(fs::read_to_string(&path).unwrap().contains("kernel"));
    }
    #[test]
    fn invalid_configuration_leaves_original_untouched() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("config.jsonc");
        fs::write(&path, "{}").unwrap();
        assert!(write_configuration(
            &path,
            "fastfetch",
            "{invalid}",
            &fingerprint("{}"),
            temp.path()
        )
        .is_err());
        assert_eq!(fs::read_to_string(path).unwrap(), "{}");
    }
}
