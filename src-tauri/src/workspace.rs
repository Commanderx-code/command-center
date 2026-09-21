use crate::platform;
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, sync::Mutex};
static LOCK: Mutex<()> = Mutex::new(());
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Project {
    pub favorite: bool,
    pub group: String,
    pub documentation: String,
    pub launch_editor: bool,
    pub launch_terminal: bool,
    pub launch_docs: bool,
}
pub type Workspace = BTreeMap<String, Project>;
#[tauri::command]
pub fn load_workspace(app: tauri::AppHandle) -> Result<Workspace, String> {
    platform::load(&platform::data_file(&app, "workspace.json")?)
}
#[tauri::command]
pub fn save_project(app: tauri::AppHandle, path: String, project: Project) -> Result<(), String> {
    let path = platform::repo(&path)?;
    if project.group.chars().count() > 60 {
        return Err("Group name is too long".into());
    }
    if !project.documentation.is_empty() {
        web_url(&project.documentation)?;
    }
    let _guard = LOCK.lock().map_err(|e| e.to_string())?;
    let mut data = load_workspace(app.clone())?;
    data.insert(path.to_string_lossy().into_owned(), project);
    platform::save(&platform::data_file(&app, "workspace.json")?, &data)
}
pub fn web_url(value: &str) -> Result<(), String> {
    let url = tauri::Url::parse(value).map_err(|_| "Enter a valid HTTP or HTTPS URL")?;
    if !["https", "http"].contains(&url.scheme())
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err("Use an HTTP(S) URL without embedded credentials".into());
    }
    Ok(())
}
#[tauri::command]
pub async fn launch_project(app: tauri::AppHandle, path: String) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = platform::repo(&path)?;
        let project = load_workspace(app.clone())?
            .get(&path.to_string_lossy().to_string())
            .cloned()
            .ok_or("Save a launch profile first")?;
        let settings = crate::settings::load_settings(app)?.unwrap_or_default();
        let mut results = Vec::new();
        for (enabled, target) in [
            (project.launch_editor, "editor"),
            (project.launch_terminal, "terminal"),
        ] {
            if enabled {
                results.push(
                    match crate::launcher::open(&path, target, &settings.editor, &settings.terminal)
                    {
                        Ok(()) => format!("Opened {target}"),
                        Err(e) => format!("{target}: {e}"),
                    },
                );
            }
        }
        if project.launch_docs {
            web_url(&project.documentation)?;
            results.push(match open::that(&project.documentation) {
                Ok(()) => "Opened documentation".into(),
                Err(e) => format!("Documentation: {e}"),
            });
        }
        if results.is_empty() {
            return Err("Choose applications in the launch profile first".into());
        }
        Ok(results)
    })
    .await
    .map_err(|e| e.to_string())?
}
