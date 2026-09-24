//! Portable definitions only: never reads credential files or executes imported commands.
use crate::{operations::Collection, platform as p, settings::Settings, workspace::Workspace};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};
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
        crate::toolbox::validate_favorites(&self.toolbox_favorites)?;
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
#[derive(Clone, Copy, Default, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Mode {
    #[default]
    Replace,
    Merge,
}
/// This machine's saved definitions, compared against an incoming bundle.
#[derive(Default)]
pub(crate) struct Current {
    settings: Settings,
    operations: Collection,
    workspace: Workspace,
    favorites: Vec<String>,
}
// Replace reads only settings, so it can still overwrite an unreadable collection.
fn current(app: &tauri::AppHandle, mode: Mode) -> Result<Current, String> {
    let settings = crate::settings::load_settings(app.clone())?.unwrap_or_default();
    if mode == Mode::Replace {
        return Ok(Current { settings, ..Default::default() });
    }
    Ok(Current {
        settings,
        operations: crate::operations::load_operations(app.clone())?,
        workspace: crate::workspace::load_workspace(app.clone())?,
        favorites: crate::toolbox::read_favorites(&crate::toolbox::favorites_file(app)?)?
            .unwrap_or_default(),
    })
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Preview {
    bundle: Bundle,
    kept: Vec<String>,
}
// Adds incoming items with new IDs. A differing item with an existing ID keeps the
// local version and is reported; identical items are not conflicts.
fn add_new<T: Serialize>(
    local: &mut Vec<T>,
    incoming: Vec<T>,
    id: impl Fn(&T) -> &str,
    label: impl Fn(&T) -> String,
    kept: &mut Vec<String>,
) {
    for item in incoming {
        match local.iter().find(|l| id(l) == id(&item)) {
            None => local.push(item),
            Some(existing) => {
                if serde_json::to_value(existing).ok() != serde_json::to_value(&item).ok() {
                    kept.push(label(&item));
                }
            }
        }
    }
}
/// Merge keeps every local definition and preference. It adds new definitions,
/// scan folders and favorites, and fills only empty integration paths.
fn merge(incoming: Bundle, current: &Current) -> Result<(Bundle, Vec<String>), String> {
    let mut kept = Vec::new();
    let mut settings = current.settings.clone();
    for root in &incoming.settings.roots {
        if !settings.roots.contains(root) {
            settings.roots.push(root.clone());
        }
    }
    add_new(
        &mut settings.custom_actions,
        incoming.settings.custom_actions,
        |a| &a.id,
        |a| format!("Quick action “{}”", a.name),
        &mut kept,
    );
    let (to, from) = (&mut settings.integrations, &incoming.settings.integrations);
    for (target, value) in [
        (&mut to.dotfiles_path, &from.dotfiles_path),
        (&mut to.flake_profile, &from.flake_profile),
        (&mut to.backup_script, &from.backup_script),
        (&mut to.full_backup_script, &from.full_backup_script),
        (&mut to.restic_repository, &from.restic_repository),
        (&mut to.ghostty_source, &from.ghostty_source),
        (&mut to.fastfetch_source, &from.fastfetch_source),
        (&mut to.recovery_notes_path, &from.recovery_notes_path),
        (&mut to.secrets_directory, &from.secrets_directory),
    ] {
        if target.is_empty() {
            *target = value.clone();
        }
    }
    let mut operations = current.operations.clone();
    let recipes = [
        (&mut operations.workflows, incoming.operations.workflows, "Workflow"),
        (&mut operations.profiles, incoming.operations.profiles, "Machine profile"),
    ];
    for (local, items, kind) in recipes {
        add_new(local, items, |r| &r.id, |r| format!("{kind} “{}”", r.name), &mut kept);
    }
    add_new(
        &mut operations.tools,
        incoming.operations.tools,
        |t| &t.id,
        |t| format!("Personal tool “{}”", t.name),
        &mut kept,
    );
    let mut workspace = current.workspace.clone();
    for (path, project) in incoming.workspace {
        match workspace.get(&path) {
            None => {
                workspace.insert(path, project);
            }
            Some(existing) => {
                if serde_json::to_value(existing).ok() != serde_json::to_value(&project).ok() {
                    kept.push(format!("Workspace profile {path}"));
                }
            }
        }
    }
    let mut favorites = current.favorites.clone();
    for id in incoming.toolbox_favorites {
        if !favorites.contains(&id) {
            favorites.push(id);
        }
    }
    let bundle = Bundle {
        settings,
        operations,
        workspace,
        toolbox_favorites: favorites,
        ..incoming
    };
    bundle.validate()?;
    Ok((bundle, kept))
}
fn prepare(
    text: &str,
    target: &str,
    current: &Current,
    mode: Mode,
) -> Result<(Bundle, Vec<String>), String> {
    if text.len() > LIMIT {
        return Err("Bundle exceeds 2 MB".into());
    }
    let mut bundle: Bundle =
        serde_json::from_str(text).map_err(|e| format!("Invalid setup bundle: {e}"))?;
    bundle.validate()?;
    strip_credentials(&mut bundle.settings);
    bundle.remap(target)?;
    let i = &mut bundle.settings.integrations;
    let old = &current.settings.integrations;
    // Health checks run automatically; imports cannot authorize a new executable.
    i.backup_health_script = old.backup_health_script.clone();
    i.restic_password_file = old.restic_password_file.clone();
    i.wallet = old.wallet.clone();
    i.wallet_folder = old.wallet_folder.clone();
    i.wallet_entry = old.wallet_entry.clone();
    if i.restic_repository.is_empty() {
        i.restic_repository = old.restic_repository.clone();
    }
    match mode {
        Mode::Replace => {
            bundle.settings.setup_completed = false;
            Ok((bundle, Vec::new()))
        }
        Mode::Merge => merge(bundle, current),
    }
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
    // Saved favorites are authoritative; the argument covers not-yet-migrated storage.
    let toolbox_favorites =
        crate::toolbox::read_favorites(&crate::toolbox::favorites_file(&app)?)?
            .unwrap_or(toolbox_favorites);
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
    mode: Option<Mode>,
) -> Result<Preview, String> {
    let mode = mode.unwrap_or_default();
    let (bundle, kept) = prepare(&text, &target_home, &current(&app, mode)?, mode)?;
    Ok(Preview { bundle, kept })
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
type Previous = Vec<(PathBuf, Option<Vec<u8>>)>;
const JOURNAL: &str = "setup-import-journal.json";
static RECOVERY: Mutex<Option<Value>> = Mutex::new(None);
#[derive(Serialize, Deserialize)]
struct Journal {
    backup: PathBuf,
}
/// Every file an import may replace. Recovery restores only these paths.
fn import_targets(app: &tauri::AppHandle) -> Result<Vec<PathBuf>, String> {
    Ok(vec![
        p::data_file(app, "setup-import.json")?,
        crate::settings::location(app)?,
        p::data_file(app, "operations.json")?,
        p::data_file(app, "workspace.json")?,
        crate::toolbox::favorites_file(app)?,
    ])
}
// Previous bytes are durably saved, then a journal names that backup before the
// first replacement. The journal is removed only once the files are consistent.
fn begin(
    files: &[(PathBuf, Vec<u8>)],
    backup: &Path,
    journal: &Path,
) -> Result<Previous, String> {
    let old: Previous = files
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
    p::save(journal, &Journal { backup: backup.into() })?;
    Ok(old)
}
fn restore(old: &[(PathBuf, Option<Vec<u8>>)]) -> Vec<String> {
    let mut failures = Vec::new();
    for (path, bytes) in old.iter().rev() {
        let result = match bytes {
            Some(v) => p::atomic_write(path, v),
            None => match fs::remove_file(path) {
                Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.to_string()),
                _ => Ok(()),
            },
        };
        if let Err(e) = result {
            failures.push(format!("{}: {e}", path.display()));
        }
    }
    failures
}
fn replace_files(
    files: &[(PathBuf, Vec<u8>)],
    backup: &Path,
    journal: &Path,
) -> Result<(), String> {
    replace_files_with(files, backup, journal, p::atomic_write)
}
fn replace_files_with(
    files: &[(PathBuf, Vec<u8>)],
    backup: &Path,
    journal: &Path,
    mut write: impl FnMut(&Path, &[u8]) -> Result<(), String>,
) -> Result<(), String> {
    let old = begin(files, backup, journal)?;
    for (index, (path, data)) in files.iter().enumerate() {
        if let Err(error) = write(path, data) {
            let failures = restore(&old[..index]);
            // A failed rollback keeps the journal so the next launch retries it.
            if failures.is_empty() {
                let _ = fs::remove_file(journal);
            }
            return Err(format!(
                "Import failed: {error}. Rollback errors: {failures:?}. Previous contents: {}",
                backup.display()
            ));
        }
    }
    fs::remove_file(journal).map_err(|e| {
        format!("Import was written but its journal could not be cleared ({e}); the previous setup will be restored on next launch")
    })
}
/// Rolls back an import that was interrupted by a crash or power loss.
fn recover(journal: &Path, allowed: &[PathBuf]) -> Result<Option<PathBuf>, String> {
    let bytes = match fs::read(journal) {
        Ok(bytes) => bytes,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(format!("Cannot read {}: {e}", journal.display())),
    };
    let manual = |detail: String| {
        format!("{detail}. Restore the previous setup manually, then remove {}", journal.display())
    };
    let entry: Journal = serde_json::from_slice(&bytes)
        .map_err(|e| manual(format!("Unreadable import journal: {e}")))?;
    let old: Previous = fs::read(&entry.backup)
        .map_err(|e| e.to_string())
        .and_then(|data| serde_json::from_slice(&data).map_err(|e| e.to_string()))
        .map_err(|e| manual(format!("Cannot read {}: {e}", entry.backup.display())))?;
    if old.iter().any(|(path, _)| !allowed.contains(path)) {
        return Err(manual(format!("{} lists unexpected files", entry.backup.display())));
    }
    let failures = restore(&old);
    if !failures.is_empty() {
        return Err(manual(format!("Could not restore {failures:?}")));
    }
    fs::remove_file(journal).map_err(|e| e.to_string())?;
    Ok(Some(entry.backup))
}
/// Runs before the interface loads; setup_import_state reports the result.
pub fn recover_interrupted_import(app: &tauri::AppHandle) {
    let result = (|| {
        let _guard = WRITE_LOCK.lock().map_err(|e| e.to_string())?;
        recover(&p::data_file(app, JOURNAL)?, &import_targets(app)?)
    })();
    let notice = match result {
        Ok(None) => return,
        Ok(Some(backup)) => json!({"restored": backup}),
        Err(error) => json!({"error": error}),
    };
    if let Ok(mut slot) = RECOVERY.lock() {
        *slot = Some(notice);
    }
}
#[tauri::command]
pub fn import_setup_bundle(
    app: tauri::AppHandle,
    text: String,
    target_home: String,
    expected: Bundle,
    mode: Option<Mode>,
) -> Result<Value, String> {
    let _guard = WRITE_LOCK.lock().map_err(|e| e.to_string())?;
    crate::jobs::require_idle(&app)?;
    let mode = mode.unwrap_or_default();
    let (bundle, _) = prepare(&text, &target_home, &current(&app, mode)?, mode)?;
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
    let import_state = json!({"token":token,"backup":backup});
    let contents = [
        serde_json::to_vec_pretty(&import_state),
        serde_json::to_vec_pretty(&bundle.settings),
        serde_json::to_vec_pretty(&bundle.operations),
        serde_json::to_vec_pretty(&bundle.workspace),
        serde_json::to_vec_pretty(&bundle.toolbox_favorites),
    ];
    let files = import_targets(&app)?
        .into_iter()
        .zip(contents)
        .map(|(path, data)| data.map(|data| (path, data)).map_err(|e| e.to_string()))
        .collect::<Result<Vec<_>, String>>()?;
    replace_files(&files, &backup, &p::data_file(&app, JOURNAL)?)?;
    if let Ok(mut notice) = RECOVERY.lock() {
        *notice = None;
    }
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
    let mut state: Value = p::load(&p::data_file(&app, "setup-import.json")?)?;
    // Shown for this app session, including reloads; a later import clears it.
    if let Some(recovery) = RECOVERY.lock().map_err(|e| e.to_string())?.clone() {
        if !state.is_object() {
            state = json!({});
        }
        state["recovery"] = recovery;
    }
    Ok(state)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn replace(text: &str, target: &str, settings: &Settings) -> Result<Bundle, String> {
        let current = Current { settings: settings.clone(), ..Default::default() };
        prepare(text, target, &current, Mode::Replace).map(|(bundle, _)| bundle)
    }
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
        let imported = replace(&serde_json::to_string(&b).unwrap(), "/home/new", &current).unwrap();
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
    fn imported_health_helpers_never_replace_or_execute_in_place_of_local_helpers() {
        use std::os::unix::fs::PermissionsExt;
        let temp = tempfile::tempdir().unwrap();
        let marker = temp.path().join("imported-ran");
        let helper = temp.path().join("health");
        fs::write(
            &helper,
            format!("#!/bin/sh\ntouch '{}'\nprintf '{{}}'\n", marker.display()),
        )
        .unwrap();
        fs::set_permissions(&helper, fs::Permissions::from_mode(0o700)).unwrap();
        let local = temp.path().join("local-health");
        fs::write(&local, "#!/bin/sh\nprintf '{\"local\":true}'\n").unwrap();
        fs::set_permissions(&local, fs::Permissions::from_mode(0o700)).unwrap();
        for configured in [String::new(), local.to_string_lossy().into_owned()] {
            let mut current = Settings::default();
            current.integrations.backup_health_script = configured.clone();
            for incoming in [
                helper.to_string_lossy().into_owned(),
                "/home/old/health".into(),
                "~/health".into(),
                String::new(),
            ] {
                let mut b = bundle();
                b.settings.integrations.backup_health_script = incoming;
                let imported = replace(
                    &serde_json::to_string(&b).unwrap(),
                    temp.path().to_str().unwrap(),
                    &current,
                )
                .unwrap();
                let report = crate::health::backup_report(&imported.settings);
                assert!(!marker.exists(), "imported helper executed");
                assert_eq!(
                    imported.settings.integrations.backup_health_script,
                    configured
                );
                assert_eq!(report["available"], !configured.is_empty());
                if !configured.is_empty() {
                    assert_eq!(report["data"]["local"], true);
                }
            }
        }
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
        assert!(replace(&"x".repeat(LIMIT + 1), "/home/new", &Settings::default()).is_err());
        b.workspace.insert("~/repo".into(), Default::default());
        b.workspace
            .insert("/home/old/repo".into(), Default::default());
        assert!(b.remap("/home/new").unwrap_err().contains("duplicate"));
        assert!(valid_home("/home/new/../elsewhere").is_err());
        assert!(replace(
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
        let journal = temp.path().join("journal.json");
        let result = replace_files_with(&files, &backup, &journal, |path, data| {
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
        assert!(!journal.exists(), "a completed rollback needs no recovery");
    }
    #[test]
    fn complete_transaction_preserves_private_backup_before_replacement() {
        use std::os::unix::fs::PermissionsExt;
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("settings.json");
        let backup = temp.path().join("backup.json");
        fs::write(&path, b"original").unwrap();
        let journal = temp.path().join("journal.json");
        replace_files(&[(path.clone(), b"next".to_vec())], &backup, &journal).unwrap();
        assert!(!journal.exists());
        assert_eq!(fs::read(path).unwrap(), b"next");
        assert_eq!(
            fs::metadata(backup).unwrap().permissions().mode() & 0o777,
            0o600
        );
    }

    #[test]
    fn interrupted_import_is_rolled_back_on_next_launch() {
        let temp = tempfile::tempdir().unwrap();
        let (old, new) = (temp.path().join("old.json"), temp.path().join("new.json"));
        let (backup, journal) = (temp.path().join("backup.json"), temp.path().join("journal.json"));
        fs::write(&old, b"original").unwrap();
        let files = vec![(old.clone(), b"replacement".to_vec()), (new.clone(), b"new".to_vec())];
        let allowed = vec![old.clone(), new.clone()];
        assert_eq!(recover(&journal, &allowed).unwrap(), None);
        // Simulate a crash after both replacements, before the journal is cleared.
        begin(&files, &backup, &journal).unwrap();
        for (path, data) in &files {
            p::atomic_write(path, data).unwrap();
        }
        assert_eq!(recover(&journal, &allowed).unwrap(), Some(backup.clone()));
        assert_eq!(fs::read(&old).unwrap(), b"original");
        assert!(!new.exists());
        assert!(!journal.exists());
        assert!(backup.exists(), "the private backup is retained");
    }
    #[test]
    fn recovery_refuses_backups_naming_other_files() {
        let temp = tempfile::tempdir().unwrap();
        let (target, other) = (temp.path().join("settings.json"), temp.path().join("other"));
        let (backup, journal) = (temp.path().join("backup.json"), temp.path().join("journal.json"));
        fs::write(&other, b"untouched").unwrap();
        begin(&[(other.clone(), vec![])], &backup, &journal).unwrap();
        fs::write(&other, b"changed").unwrap();
        let error = recover(&journal, &[target]).unwrap_err();
        assert!(error.contains("unexpected files") && error.contains("manually"));
        assert_eq!(fs::read(&other).unwrap(), b"changed");
        assert!(journal.exists(), "unrecovered imports stay visible");
    }
    #[test]
    fn merge_keeps_local_definitions_and_adds_new_ones() {
        use crate::operations::{Recipe, Tool};
        let step = crate::operations::Step {
            name: "Fetch".into(),
            request: crate::integrations::Request { action: "fetch".into(), ..Default::default() },
            satisfied_path: String::new(),
        };
        let recipe = |id: &str, name: &str| Recipe {
            id: id.into(),
            name: name.into(),
            steps: vec![step.clone()],
            ..Default::default()
        };
        let mut current = Current::default();
        current.settings.setup_completed = true;
        current.settings.theme = "light".into();
        current.settings.roots = vec!["/home/new/code".into()];
        current.settings.integrations.dotfiles_path = "/home/new/local-dotfiles".into();
        current.settings.integrations.backup_health_script = "/home/new/health".into();
        current.operations.workflows = vec![recipe("shared", "Local"), recipe("same", "Same")];
        current.workspace.insert("/home/new/code/app".into(), Default::default());
        current.favorites = vec!["local-tool".into()];
        let mut b = bundle();
        b.settings.theme = "dark".into();
        b.settings.roots = vec!["/home/old/code".into(), "/home/old/other".into()];
        b.settings.integrations.dotfiles_path = "/home/old/dotfiles".into();
        b.settings.integrations.backup_script = "/home/old/backup".into();
        b.settings.integrations.backup_health_script = "/home/old/health".into();
        b.operations.workflows = vec![recipe("shared", "Incoming"), recipe("same", "Same"), recipe("new", "New")];
        b.operations.tools = vec![Tool { id: "tool".into(), name: "Tool".into(), command: "true".into(), directory: "~/code".into(), mode: "background".into(), ..Default::default() }];
        let project = crate::workspace::Project { group: "Incoming".into(), ..Default::default() };
        b.workspace.insert("/home/old/code/app".into(), project.clone());
        b.workspace.insert("/home/old/code/lib".into(), project);
        b.toolbox_favorites = vec!["local-tool".into(), "tool".into()];
        let (merged, kept) = prepare(&serde_json::to_string(&b).unwrap(), "/home/new", &current, Mode::Merge).unwrap();
        let s = &merged.settings;
        assert!(s.setup_completed && s.theme == "light", "local preferences stay");
        assert_eq!(s.roots, vec!["/home/new/code", "/home/new/other"]);
        assert_eq!(s.integrations.dotfiles_path, "/home/new/local-dotfiles");
        assert_eq!(s.integrations.backup_script, "/home/new/backup", "empty paths are filled");
        assert_eq!(s.integrations.backup_health_script, "/home/new/health");
        let names: Vec<_> = merged.operations.workflows.iter().map(|r| r.name.as_str()).collect();
        assert_eq!(names, vec!["Local", "Same", "New"]);
        assert_eq!(merged.operations.tools.len(), 1);
        assert_eq!(merged.workspace["/home/new/code/app"].group, "");
        assert_eq!(merged.workspace["/home/new/code/lib"].group, "Incoming");
        assert_eq!(merged.toolbox_favorites, vec!["local-tool", "tool"]);
        assert_eq!(kept, vec!["Workflow “Incoming”", "Workspace profile /home/new/code/app"]);
        current.operations.workflows = (0..30).map(|i| recipe(&format!("w{i}"), "W")).collect();
        assert!(prepare(&serde_json::to_string(&b).unwrap(), "/home/new", &current, Mode::Merge).is_err());
    }
}
