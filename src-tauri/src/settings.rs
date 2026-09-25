use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
};
use tauri::Manager;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub setup_completed: bool,
    pub custom_actions: Vec<crate::custom_actions::CustomAction>,
    pub display_name: String,
    pub editor: String,
    pub terminal: String,
    pub accent: String,
    pub density: String,
    pub reduced_motion: bool,
    pub startup_page: String,
    pub refresh_seconds: u32,
    pub scan_depth: usize,
    pub roots: Vec<String>,
    pub theme: String,
    pub text_size: String,
    pub repo_layout: String,
    pub repo_sort: String,
    pub show_paths: bool,
    pub show_hero: bool,
    pub integrations: Integrations,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            setup_completed: false,
            custom_actions: Vec::new(),
            display_name: "Commander".into(),
            editor: "auto".into(),
            terminal: "auto".into(),
            accent: "cyan".into(),
            density: "comfortable".into(),
            reduced_motion: false,
            startup_page: "dashboard".into(),
            refresh_seconds: 0,
            scan_depth: 3,
            theme: "dark".into(),
            text_size: "normal".into(),
            repo_layout: "cards".into(),
            repo_sort: "name".into(),
            show_paths: true,
            show_hero: true,
            integrations: Integrations::default(),
            roots: vec!["~/github/projects".into(), "~/dotfiles".into()],
        }
    }
}
impl Settings {
    pub fn validate(&self) -> Result<(), String> {
        if self.display_name.trim().is_empty() || self.display_name.chars().count() > 40 {
            return Err("Display name must have 1–40 characters".into());
        }
        if !["auto", "kate", "nvim", "code", "codium", "zed"].contains(&self.editor.as_str()) {
            return Err("Unsupported editor".into());
        }
        if ![
            "auto",
            "ghostty",
            "konsole",
            "gnome-terminal",
            "kitty",
            "alacritty",
            "wezterm",
            "foot",
        ]
        .contains(&self.terminal.as_str())
        {
            return Err("Unsupported terminal".into());
        }
        if !["cyan", "violet", "green"].contains(&self.accent.as_str())
            || !["comfortable", "compact"].contains(&self.density.as_str())
        {
            return Err("Invalid appearance settings".into());
        }
        if !["dashboard", "repositories", "toolbox", "terminal", "sync", "backup", "config", "health", "activity", "attention", "services", "inventory", "operations", "timeline", "settings"].contains(&self.startup_page.as_str()) {
            return Err("Invalid startup page".into());
        }
        if ![0, 30, 60, 300].contains(&self.refresh_seconds) || !(1..=6).contains(&self.scan_depth)
        {
            return Err("Invalid scan settings".into());
        }
        if self.roots.len() > 32
            || self.roots.iter().any(|r| {
                r.len() > 4096
                    || r.contains('\0')
                    || !(r == "~" || r.starts_with("~/") || r.starts_with('/'))
            })
        {
            return Err("Use up to 32 absolute or ~/ scan folders".into());
        }
        if !["dark", "light", "system"].contains(&self.theme.as_str())
            || !["normal", "large"].contains(&self.text_size.as_str())
            || !["cards", "list"].contains(&self.repo_layout.as_str())
            || !["name", "name-desc", "attention"].contains(&self.repo_sort.as_str())
        {
            return Err("Invalid display preferences".into());
        }
        if self.custom_actions.len() > 20 { return Err("Use up to 20 custom actions".into()); }
        let mut ids = std::collections::HashSet::new();
        for action in &self.custom_actions {
            action.validate()?;
            if !ids.insert(&action.id) { return Err("Custom action IDs must be unique".into()); }
        }
        self.integrations.validate()?;
        Ok(())
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Integrations {
    pub dotfiles_path: String,
    pub flake_profile: String,
    pub backup_script: String,
    pub full_backup_script: String,
    pub backup_health_script: String,
    pub restic_repository: String,
    pub restic_password_file: String,
    pub wallet: String,
    pub wallet_folder: String,
    pub wallet_entry: String,
    pub ghostty_source: String,
    pub fastfetch_source: String,
    pub recovery_notes_path: String,
    pub secrets_directory: String,
    pub backup_max_hours: u32,
}
impl Default for Integrations {
    fn default() -> Self {
        Self {
            dotfiles_path: String::new(),
            flake_profile: String::new(),
            backup_script: String::new(),
            full_backup_script: String::new(),
            backup_health_script: String::new(),
            restic_repository: String::new(),
            restic_password_file: String::new(),
            wallet: String::new(),
            wallet_folder: String::new(),
            wallet_entry: String::new(),
            ghostty_source: String::new(),
            fastfetch_source: String::new(),
            recovery_notes_path: String::new(),
            secrets_directory: String::new(),
            backup_max_hours: 24,
        }
    }
}
impl Integrations {
    pub fn validate(&self) -> Result<(), String> {
        for value in [
            &self.dotfiles_path,
            &self.backup_script,
            &self.full_backup_script,
            &self.backup_health_script,
            &self.restic_password_file,
            &self.ghostty_source,
            &self.fastfetch_source,
            &self.recovery_notes_path,
            &self.secrets_directory,
        ] {
            if !value.is_empty()
                && (value.len() > 4096
                    || value.contains(['\0', '\n', '\r'])
                    || !(value.starts_with('/') || value.starts_with("~/")))
            {
                return Err("Integration paths must be absolute or start with ~/".into());
            }
        }
        for value in [
            &self.flake_profile,
            &self.restic_repository,
            &self.wallet,
            &self.wallet_folder,
            &self.wallet_entry,
        ] {
            if value.len() > 4096 || value.contains(['\0', '\n', '\r']) {
                return Err("Invalid integration value".into());
            }
        }
        if self.restic_repository.starts_with('-') {
            return Err("Invalid repository address".into());
        }
        if !(1..=8760).contains(&self.backup_max_hours) {
            return Err("Backup freshness must be 1–8760 hours".into());
        }
        Ok(())
    }
}

pub fn location(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|p| p.join("settings.json"))
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub fn load_settings(app: tauri::AppHandle) -> Result<Option<Settings>, String> {
    let path = location(&app)?;
    let text = match fs::read_to_string(&path) {
        Ok(text) => text,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(format!("Cannot read {}: {e}", path.display())),
    };
    let settings: Settings = serde_json::from_str(&text)
        .map_err(|e| format!("Invalid settings file {}: {e}", path.display()))?;
    settings.validate()?;
    Ok(Some(settings))
}
#[tauri::command]
pub fn save_settings(app: tauri::AppHandle, settings: Settings) -> Result<(), String> {
    let _setup_guard = crate::setup::WRITE_LOCK.lock().map_err(|e| e.to_string())?;
    settings.validate()?;
    write_settings(&location(&app)?, &settings)
}
// Settings can hold repository credentials, so the file and its backup are
// written privately (0600) regardless of umask or the previous file's mode.
fn write_settings(path: &Path, settings: &Settings) -> Result<(), String> {
    fs::create_dir_all(path.parent().ok_or("Invalid settings path")?).map_err(|e| e.to_string())?;
    let data = serde_json::to_vec_pretty(settings).map_err(|e| e.to_string())?;
    // Preserve previous contents; atomic_write renames in the same directory for atomic replacement on Linux.
    if path.exists() {
        let previous = fs::read(path).map_err(|e| e.to_string())?;
        crate::platform::atomic_write(&path.with_extension("json.bak"), &previous)?;
    }
    crate::platform::atomic_write(path, &data)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn older_preferences_receive_new_defaults() {
        let settings: Settings = serde_json::from_str(
            r#"{"displayName":"Matt","editor":"kate","roots":["~/projects"]}"#,
        )
        .unwrap();
        assert_eq!(settings.theme, "dark");
        assert!(settings.show_paths);
        assert_eq!(settings.editor, "kate");
        assert!(settings.validate().is_ok());
    }
    #[test]
    fn accepts_all_workspace_start_pages() {
        let mut settings = Settings::default();
        for page in ["dashboard", "repositories", "toolbox", "terminal", "sync", "backup", "config", "health", "activity", "attention", "services", "inventory", "operations", "timeline", "settings"] {
            settings.startup_page = page.into();
            assert!(settings.validate().is_ok());
        }
        settings.startup_page = "unknown".into();
        assert!(settings.validate().is_err());
    }
    #[test]
    fn validates_launch_and_scan_boundaries() {
        let mut settings = Settings::default();
        assert!(settings.validate().is_ok());
        settings.editor = "sh -c anything".into();
        assert!(settings.validate().is_err());
        settings.editor = "kate".into();
        settings.scan_depth = 99;
        assert!(settings.validate().is_err());
        settings.scan_depth = 3;
        settings.roots = vec!["relative/path".into()];
        assert!(settings.validate().is_err());
        settings.roots.clear();
        assert!(settings.validate().is_ok());
    }
    #[test]
    fn saved_settings_and_backup_are_private() {
        use std::os::unix::fs::PermissionsExt;
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("settings.json");
        let backup = path.with_extension("json.bak");
        // Files left by earlier versions were created with umask-default modes.
        for file in [&path, &backup] {
            fs::write(file, "{}").unwrap();
            fs::set_permissions(file, fs::Permissions::from_mode(0o644)).unwrap();
        }
        let mut settings = Settings::default();
        settings.integrations.restic_repository = "rest:https://user:secret@example.invalid/repo".into();
        write_settings(&path, &settings).unwrap();
        for file in [&path, &backup] {
            assert_eq!(fs::metadata(file).unwrap().permissions().mode() & 0o777, 0o600);
        }
        assert_eq!(fs::read_to_string(&backup).unwrap(), "{}");
        let saved: Settings = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
        assert_eq!(saved.integrations.restic_repository, settings.integrations.restic_repository);
        let mut names: Vec<_> = fs::read_dir(temp.path())
            .unwrap()
            .map(|entry| entry.unwrap().file_name())
            .collect();
        names.sort();
        assert_eq!(names, ["settings.json", "settings.json.bak"]);
    }
}

#[tauri::command]
pub fn export_settings(app: tauri::AppHandle) -> Result<String, String> {
    let settings = load_settings(app.clone())?.unwrap_or_default();
    let folder = app.path().download_dir().map_err(|e|e.to_string())?;
    fs::create_dir_all(&folder).map_err(|e|e.to_string())?;
    let path = folder.join(format!("command-center-settings-{}.json", crate::platform::now()));
    let data = serde_json::to_vec_pretty(&serde_json::json!({"format":"command-center-settings","version":1,"settings":settings})).map_err(|e|e.to_string())?;
    if path.exists() { return Err("Export filename already exists; try again".into()); }
    crate::platform::atomic_write(&path, &data)?;
    Ok(path.to_string_lossy().into_owned())
}
