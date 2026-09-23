//! Portable definitions only: never reads credential files or executes imported commands.
use crate::{operations::Collection, platform as p, settings::Settings, workspace::Workspace};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{collections::BTreeMap, fs, path::PathBuf, sync::Mutex};
use tauri::Manager;
pub(crate) static WRITE_LOCK: Mutex<()> = Mutex::new(());
const LIMIT: usize = 2_000_000;
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Bundle {
    format: String,
    version: u32,
    source_home: String,
    settings: Settings,
    operations: Collection,
    workspace: Workspace,
    repositories: Vec<String>,
    toolbox_favorites: Vec<String>,
}
impl Bundle {
    fn validate(&self) -> Result<(), String> {
        if self.format != "command-center-setup" || self.version != 1 {
            return Err("Choose a Command Center setup bundle (version 1)".into());
        }
        valid_home(&self.source_home)?;
        self.settings.validate()?;
        self.operations.validate()?;
        if self.workspace.len() > 1000
            || self.repositories.len() > 1000
            || self.toolbox_favorites.len() > 1000
        {
            return Err("Bundle collection limit exceeded".into());
        }
        for (path, project) in &self.workspace {
            valid_path(path)?;
            project.validate()?;
        }
        for path in &self.repositories {
            valid_path(path)?;
        }
        if self
            .toolbox_favorites
            .iter()
            .any(|id| id.is_empty() || id.len() > 500 || id.contains(['\0', '\n', '\r']))
        {
            return Err("Invalid Toolbox favorite".into());
        }
        if serde_json::to_vec(self).map_err(|e| e.to_string())?.len() > LIMIT {
            return Err("Bundle exceeds 2 MB".into());
        }
        Ok(())
    }
    fn remap(&mut self, target: &str) -> Result<(), String> {
        valid_home(target)?;
        let from = self.source_home.clone();
        let map = |s: &mut String| {
            *s = remap_path(s, &from, target);
        };
        for path in &mut self.settings.roots {
            map(path);
        }
        for action in &mut self.settings.custom_actions {
            map(&mut action.directory);
        }
        let i = &mut self.settings.integrations;
        for path in [
            &mut i.dotfiles_path,
            &mut i.backup_script,
            &mut i.full_backup_script,
            &mut i.backup_health_script,
            &mut i.restic_repository,
            &mut i.ghostty_source,
            &mut i.fastfetch_source,
            &mut i.recovery_notes_path,
            &mut i.secrets_directory,
        ] {
            map(path);
        }
        for recipe in self
            .operations
            .workflows
            .iter_mut()
            .chain(self.operations.profiles.iter_mut())
        {
            map(&mut recipe.dotfiles_path);
            for step in &mut recipe.steps {
                map(&mut step.satisfied_path);
                for path in [
                    &mut step.request.path,
                    &mut step.request.directory,
                    &mut step.request.target,
                ] {
                    map(path);
                }
            }
        }
        for tool in &mut self.operations.tools {
            map(&mut tool.directory);
        }
        let mut workspace = BTreeMap::new();
        for (path, project) in std::mem::take(&mut self.workspace) {
            if workspace
                .insert(remap_path(&path, &from, target), project)
                .is_some()
            {
                return Err("Remapping creates duplicate workspace paths".into());
            }
        }
        self.workspace = workspace;
        for path in &mut self.repositories {
            map(path);
        }
        // Remember individually known repositories as scan roots, including missing repos.
        for path in &self.repositories {
            if !self.settings.roots.iter().any(|root| {
                path == root || path.starts_with(&format!("{}/", root.trim_end_matches('/')))
            }) {
                if self.settings.roots.len() >= 32 {
                    return Err("Imported repositories need more than 32 scan roots; consolidate roots before exporting".into());
                }
                self.settings.roots.push(path.clone());
            }
        }
        self.source_home = target.into();
        self.validate()
    }
}
fn valid_path(value: &str) -> Result<(), String> {
    if value.len() > 4096 || value.contains(['\0', '\n', '\r']) {
        return Err("Invalid bundle path".into());
    }
    p::expand(value).map(|_| ())
}
fn valid_home(value: &str) -> Result<(), String> {
    valid_path(value)?;
    if !value.starts_with('/')
        || value == "/"
        || value.ends_with('/')
        || value.split('/').any(|s| s == ".." || s == ".")
    {
        return Err(
            "Enter an absolute home folder without a trailing slash or dot components".into(),
        );
    }
    Ok(())
}
fn remap_path(value: &str, source: &str, target: &str) -> String {
    if value == source || value == "~" {
        return target.into();
    }
    if let Some(rest) = value
        .strip_prefix(&format!("{source}/"))
        .or_else(|| value.strip_prefix("~/"))
    {
        return format!("{target}/{rest}");
    }
    value.into()
}
fn strip_credentials(settings: &mut Settings) {
    let i = &mut settings.integrations;
    i.restic_password_file.clear();
    i.wallet.clear();
    i.wallet_folder.clear();
    i.wallet_entry.clear();
    // Remote repository addresses may embed passwords or access tokens.
    if !i.restic_repository.starts_with('/') && !i.restic_repository.starts_with("~/") {
        i.restic_repository.clear();
    }
}
fn prepare(text: &str, target: &str, current: &Settings) -> Result<Bundle, String> {
    if text.len() > LIMIT {
        return Err("Bundle exceeds 2 MB".into());
    }
    let mut bundle: Bundle =
        serde_json::from_str(text).map_err(|e| format!("Invalid setup bundle: {e}"))?;
    bundle.validate()?;
    strip_credentials(&mut bundle.settings);
    bundle.remap(target)?;
    let i = &mut bundle.settings.integrations;
    let old = &current.integrations;
    i.restic_password_file = old.restic_password_file.clone();
    i.wallet = old.wallet.clone();
    i.wallet_folder = old.wallet_folder.clone();
    i.wallet_entry = old.wallet_entry.clone();
    if i.restic_repository.is_empty() {
        i.restic_repository = old.restic_repository.clone();
    }
    bundle.settings.setup_completed = false;
    Ok(bundle)
}
#[tauri::command]
pub fn setup_environment() -> Value {
    let distribution = fs::read_to_string("/etc/os-release")
        .unwrap_or_default()
        .lines()
        .find_map(|l| l.strip_prefix("PRETTY_NAME="))
        .unwrap_or("Linux")
        .trim_matches('"')
        .to_string();
    json!({"home":p::home(),"distribution":distribution})
}
#[tauri::command]
pub fn create_setup_bundle(
    app: tauri::AppHandle,
    repositories: Vec<String>,
    toolbox_favorites: Vec<String>,
) -> Result<Bundle, String> {
    let mut settings = crate::settings::load_settings(app.clone())?.unwrap_or_default();
    strip_credentials(&mut settings);
    let bundle = Bundle {
        format: "command-center-setup".into(),
        version: 1,
        source_home: p::home().to_string_lossy().into_owned(),
        settings,
        operations: crate::operations::load_operations(app.clone())?,
        workspace: crate::workspace::load_workspace(app)?,
        repositories,
        toolbox_favorites,
    };
    bundle.validate()?;
    Ok(bundle)
}
#[tauri::command]
pub fn preview_setup_bundle(
    app: tauri::AppHandle,
    text: String,
    target_home: String,
) -> Result<Bundle, String> {
    prepare(
        &text,
        &target_home,
        &crate::settings::load_settings(app)?.unwrap_or_default(),
    )
}
#[tauri::command]
pub fn export_setup_bundle(app: tauri::AppHandle, mut bundle: Bundle) -> Result<String, String> {
    strip_credentials(&mut bundle.settings);
    bundle.validate()?;
    let path = app
        .path()
        .download_dir()
        .map_err(|e| e.to_string())?
        .join(format!("command-center-setup-{}.json", p::now()));
    if path.exists() {
        return Err("Export filename exists; try again".into());
    }
    p::save(&path, &bundle)?;
    Ok(path.to_string_lossy().into_owned())
}
// All previous bytes are durably saved before the first replacement. Ordinary write
// failures roll back completed writes; the backup also supports crash recovery.
fn replace_files(files: &[(PathBuf, Vec<u8>)], backup: &std::path::Path) -> Result<(), String> {
    replace_files_with(files, backup, p::atomic_write)
}
fn replace_files_with(
    files: &[(PathBuf, Vec<u8>)],
    backup: &std::path::Path,
    mut write: impl FnMut(&std::path::Path, &[u8]) -> Result<(), String>,
) -> Result<(), String> {
    let old: Vec<(PathBuf, Option<Vec<u8>>)> = files
        .iter()
        .map(|(path, _)| {
            let bytes = match fs::read(path) {
                Ok(v) => Some(v),
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => None,
                Err(e) => return Err(e.to_string()),
            };
            Ok((path.clone(), bytes))
        })
        .collect::<Result<_, String>>()?;
    p::save(backup, &old)?;
    for (index, (path, data)) in files.iter().enumerate() {
        if let Err(error) = write(path, data) {
            let mut failures = Vec::new();
            for (path, bytes) in old.iter().take(index).rev() {
                let result = match bytes {
                    Some(v) => p::atomic_write(path, v),
                    None => fs::remove_file(path).map_err(|e| e.to_string()),
                };
                if let Err(e) = result {
                    failures.push(e);
                }
            }
            return Err(format!(
                "Import failed: {error}. Rollback errors: {failures:?}. Previous contents: {}",
                backup.display()
            ));
        }
    }
    Ok(())
}
#[tauri::command]
pub fn import_setup_bundle(
    app: tauri::AppHandle,
    text: String,
    target_home: String,
    expected: Bundle,
) -> Result<Value, String> {
    let _guard = WRITE_LOCK.lock().map_err(|e| e.to_string())?;
    crate::jobs::require_idle(&app)?;
    let bundle = prepare(
        &text,
        &target_home,
        &crate::settings::load_settings(app.clone())?.unwrap_or_default(),
    )?;
    if serde_json::to_value(&bundle).map_err(|e| e.to_string())?
        != serde_json::to_value(expected).map_err(|e| e.to_string())?
    {
        return Err("Setup changed after preview; update the preview and review again".into());
    }
    let backup = p::data_file(
        &app,
        &format!("setup-backups/before-import-{}.json", p::now()),
    )?;
    let token = p::now().to_string();
    let import_state =
        json!({"token":token,"backup":backup,"toolboxFavorites":bundle.toolbox_favorites});
    let files = vec![
        (
            p::data_file(&app, "setup-import.json")?,
            serde_json::to_vec_pretty(&import_state).map_err(|e| e.to_string())?,
        ),
        (
            crate::settings::location(&app)?,
            serde_json::to_vec_pretty(&bundle.settings).map_err(|e| e.to_string())?,
        ),
        (
            p::data_file(&app, "operations.json")?,
            serde_json::to_vec_pretty(&bundle.operations).map_err(|e| e.to_string())?,
        ),
        (
            p::data_file(&app, "workspace.json")?,
            serde_json::to_vec_pretty(&bundle.workspace).map_err(|e| e.to_string())?,
        ),
    ];
    replace_files(&files, &backup)?;
    Ok(import_state)
}
#[tauri::command]
pub async fn assess_setup_profile(
    app: tauri::AppHandle,
    id: String,
    settings: Settings,
) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        settings.validate()?;
        let collection=crate::operations::load_operations(app.clone())?;
        let profile=collection.profiles.iter().find(|p|p.id==id).ok_or("Profile no longer exists")?;
        let rows: Vec<Value>=profile.steps.iter().map(|step| {
            let mut request=step.request.clone();request.profile_id=id.clone();
            let result=crate::jobs::build_plan(&app,&request,&settings);
            json!({"name":step.name,"status":if result.is_ok(){"Ready to review"}else{"Needs setup"},"detail":result.err().unwrap_or_default()})
        }).collect();
        Ok(json!(rows))
    }).await.map_err(|e|e.to_string())?
}

#[tauri::command]
pub fn setup_import_state(app: tauri::AppHandle) -> Result<Value, String> {
    p::load(&p::data_file(&app, "setup-import.json")?)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn bundle() -> Bundle {
        Bundle {
            format: "command-center-setup".into(),
            version: 1,
            source_home: "/home/old".into(),
            settings: Settings::default(),
            operations: Collection::default(),
            workspace: BTreeMap::new(),
            repositories: vec![],
            toolbox_favorites: vec!["one".into()],
        }
    }
    #[test]
    fn remaps_structured_paths_preserves_commands_and_local_credentials() {
        let mut b = bundle();
        b.settings.roots = vec!["/home/old/code".into()];
        b.settings.integrations.dotfiles_path = "/home/old/dotfiles".into();
        b.settings.integrations.restic_password_file = "/home/old/private".into();
        b.settings.integrations.restic_repository = "sftp:user:secret@host/repo".into();
        b.settings
            .custom_actions
            .push(crate::custom_actions::CustomAction {
                id: "task".into(),
                name: "Task".into(),
                command: "echo /home/old/literal".into(),
                directory: "~/code/repo".into(),
                shell: "direct".into(),
                mode: "background".into(),
            });
        b.workspace.insert("~/code/repo".into(), Default::default());
        b.repositories.push("/home/old/code/repo".into());
        let mut current = Settings::default();
        current.integrations.restic_password_file = "/home/new/credential".into();
        current.integrations.restic_repository = "/backup/local".into();
        let imported = prepare(&serde_json::to_string(&b).unwrap(), "/home/new", &current).unwrap();
        assert_eq!(imported.settings.roots, vec!["/home/new/code"]);
        assert!(imported.workspace.contains_key("/home/new/code/repo"));
        assert_eq!(
            imported.settings.custom_actions[0].directory,
            "/home/new/code/repo"
        );
        assert_eq!(
            imported.settings.custom_actions[0].command,
            "echo /home/old/literal"
        );
        assert_eq!(
            imported.settings.integrations.restic_password_file,
            "/home/new/credential"
        );
        assert_eq!(
            imported.settings.integrations.restic_repository,
            "/backup/local"
        );
        assert_eq!(
            remap_path("/home/older/repo", "/home/old", "/home/new"),
            "/home/older/repo"
        );
        assert!(!imported.settings.setup_completed);
    }
    #[test]
    fn redaction_removes_credential_references_and_remote_repository_addresses() {
        let mut settings = Settings::default();
        settings.integrations.wallet = "private".into();
        settings.integrations.restic_password_file = "/secret".into();
        settings.integrations.restic_repository = "https://user:pass@example.com".into();
        strip_credentials(&mut settings);
        assert!(settings.integrations.wallet.is_empty());
        assert!(settings.integrations.restic_password_file.is_empty());
        assert!(settings.integrations.restic_repository.is_empty());
    }
    #[test]
    fn rejects_incompatible_oversized_and_colliding_bundles() {
        let mut b = bundle();
        b.version = 9;
        assert!(b.validate().is_err());
        b.version = 1;
        assert!(prepare(&"x".repeat(LIMIT + 1), "/home/new", &Settings::default()).is_err());
        b.workspace.insert("~/repo".into(), Default::default());
        b.workspace
            .insert("/home/old/repo".into(), Default::default());
        assert!(b.remap("/home/new").unwrap_err().contains("duplicate"));
        assert!(valid_home("/home/new/../elsewhere").is_err());
        assert!(prepare(
            r#"{"format":"command-center-setup","version":1}"#,
            "/home/new",
            &Settings::default()
        )
        .is_err());
    }
    #[test]
    fn remembers_missing_repositories_without_creating_or_cloning_them() {
        let temp = tempfile::tempdir().unwrap();
        let target = temp.path().join("missing");
        let mut b = bundle();
        b.settings.roots.clear();
        b.repositories = vec![target.to_string_lossy().into_owned()];
        b.remap("/home/new").unwrap();
        assert_eq!(b.settings.roots, b.repositories);
        assert!(!target.exists());
    }
    #[test]
    fn rollback_restores_prior_bytes_and_removes_new_files_after_write_failure() {
        let temp = tempfile::tempdir().unwrap();
        let old = temp.path().join("old.json");
        let new = temp.path().join("new.json");
        let last = temp.path().join("last.json");
        let backup = temp.path().join("backup.json");
        fs::write(&old, b"original").unwrap();
        let files = vec![
            (old.clone(), b"replacement".to_vec()),
            (new.clone(), b"new".to_vec()),
            (last, b"last".to_vec()),
        ];
        let mut calls = 0;
        let result = replace_files_with(&files, &backup, |path, data| {
            calls += 1;
            if calls == 3 {
                Err("simulated disk failure".into())
            } else {
                p::atomic_write(path, data)
            }
        });
        assert!(result.unwrap_err().contains("simulated disk failure"));
        assert_eq!(fs::read(&old).unwrap(), b"original");
        assert!(!new.exists());
        let recorded: Vec<(PathBuf, Option<Vec<u8>>)> = p::load(&backup).unwrap();
        assert_eq!(recorded[0].1.as_deref(), Some(b"original".as_slice()));
    }
    #[test]
    fn complete_transaction_preserves_private_backup_before_replacement() {
        use std::os::unix::fs::PermissionsExt;
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("settings.json");
        let backup = temp.path().join("backup.json");
        fs::write(&path, b"original").unwrap();
        replace_files(&[(path.clone(), b"next".to_vec())], &backup).unwrap();
        assert_eq!(fs::read(path).unwrap(), b"next");
        assert_eq!(
            fs::metadata(backup).unwrap().permissions().mode() & 0o777,
            0o600
        );
    }
}
