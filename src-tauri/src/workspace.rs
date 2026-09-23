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
    pub tasks: Vec<Task>,
    pub services: Vec<Service>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Task {
    pub id: String,
    pub name: String,
    pub command: String,
    pub shell: String,
    pub mode: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Service {
    pub scope: String,
    pub unit: String,
}
impl Project {
    pub fn validate(&self) -> Result<(), String> {
        if self.group.chars().count() > 60 || self.tasks.len() > 30 || self.services.len() > 20 {
            return Err("Use a group up to 60 characters, 30 tasks and 20 services".into());
        }
        if !self.documentation.is_empty() {
            web_url(&self.documentation)?;
        }
        let mut ids = std::collections::BTreeSet::new();
        for task in &self.tasks {
            task.action("~").validate()?;
            if !ids.insert(&task.id) {
                return Err("Task IDs must be unique".into());
            }
        }
        for service in &self.services {
            if !["user", "system"].contains(&service.scope.as_str())
                || !(service.unit.ends_with(".service") || service.unit.ends_with(".timer"))
                || service.unit.len() > 200
                || service.unit.starts_with('-')
                || !service
                    .unit
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b"_.@:-".contains(&b))
            {
                return Err("Choose user/system scope and a valid systemd unit name".into());
            }
        }
        Ok(())
    }
}
impl Task {
    fn action(&self, directory: &str) -> crate::custom_actions::CustomAction {
        crate::custom_actions::CustomAction {
            id: self.id.clone(),
            name: self.name.clone(),
            command: self.command.clone(),
            directory: directory.into(),
            shell: self.shell.clone(),
            mode: self.mode.clone(),
        }
    }
}
pub type Workspace = BTreeMap<String, Project>;
#[tauri::command]
pub fn load_workspace(app: tauri::AppHandle) -> Result<Workspace, String> {
    platform::load(&platform::data_file(&app, "workspace.json")?)
}
#[tauri::command]
pub fn save_project(app: tauri::AppHandle, path: String, project: Project) -> Result<(), String> {
    let _setup_guard = crate::setup::WRITE_LOCK.lock().map_err(|e| e.to_string())?;
    let path = platform::repo(&path)?;
    project.validate()?;
    let _guard = LOCK.lock().map_err(|e| e.to_string())?;
    let mut data = load_workspace(app.clone())?;
    data.insert(path.to_string_lossy().into_owned(), project);
    platform::save(&platform::data_file(&app, "workspace.json")?, &data)
}
pub fn task_plan(
    app: &tauri::AppHandle,
    request: &crate::integrations::Request,
) -> Result<crate::integrations::Plan, String> {
    let path = platform::repo(&request.path)?;
    let data = load_workspace(app.clone())?;
    let project = data
        .get(&path.to_string_lossy().to_string())
        .ok_or("Save the workspace first")?;
    project.validate()?;
    let task = project
        .tasks
        .iter()
        .find(|t| t.id == request.custom_id)
        .ok_or("Task no longer exists")?;
    let settings = crate::settings::Settings {
        custom_actions: vec![task.action(&path.to_string_lossy())],
        ..Default::default()
    };
    let mut plan = crate::custom_actions::plan(request, &settings)?;
    plan.explanation = "Run this saved project task in the repository root. Project scripts may execute arbitrary commands, including pre/post hooks. Review the project and command before running.".into();
    Ok(plan)
}
fn detect_tasks(path: &std::path::Path) -> Result<Vec<Task>, String> {
    let mut tasks = Vec::new();
    let mut add = |id: &str, name: &str, command: String| {
        tasks.push(Task {
            id: id.into(),
            name: name.into(),
            command,
            shell: "direct".into(),
            mode: "embedded".into(),
        })
    };
    let package = path.join("package.json");
    if package.is_file() {
        use std::io::Read;
        let mut bytes = Vec::new();
        std::fs::File::open(package)
            .map_err(|e| e.to_string())?
            .take(1_000_001)
            .read_to_end(&mut bytes)
            .map_err(|e| e.to_string())?;
        if bytes.len() > 1_000_000 {
            return Err("package.json exceeds 1 MB".into());
        }
        let value: serde_json::Value =
            serde_json::from_slice(&bytes).map_err(|e| format!("Invalid package.json: {e}"))?;
        for name in ["build", "test", "dev", "lint", "check", "start"] {
            if value["scripts"][name].is_string() {
                add(
                    &format!("npm-{name}"),
                    &format!("npm · {name}"),
                    format!("npm run {name}"),
                );
            }
        }
    }
    if path.join("Cargo.toml").is_file() {
        for name in ["build", "test", "check", "run"] {
            add(
                &format!("cargo-{name}"),
                &format!("Cargo · {name}"),
                format!("cargo {name}"),
            );
        }
    }
    Ok(tasks)
}
#[tauri::command]
pub async fn detect_project_tasks(path: String) -> Result<Vec<Task>, String> {
    tauri::async_runtime::spawn_blocking(move || detect_tasks(&platform::repo(&path)?))
        .await
        .map_err(|e| e.to_string())?
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

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn older_workspace_profiles_migrate_and_invalid_tasks_are_rejected() {
        let mut project: Project =
            serde_json::from_str(r#"{"favorite":true,"group":"Work"}"#).unwrap();
        assert!(project.tasks.is_empty());
        assert!(project.validate().is_ok());
        let task = Task {
            id: "test".into(),
            name: "Test".into(),
            command: "printf '%s' 'a b'".into(),
            shell: "direct".into(),
            mode: "embedded".into(),
        };
        project.tasks = vec![task.clone(), task];
        assert!(project.validate().is_err());
        project.tasks.pop();
        project.tasks[0].shell = "unsupported".into();
        assert!(project.validate().is_err());
        project.tasks.clear();
        project.services.push(Service {
            scope: "user".into(),
            unit: "--now".into(),
        });
        assert!(project.validate().is_err());
    }
    #[test]
    fn discovers_only_known_tasks_without_executing_project_scripts() {
        let dir = tempfile::tempdir().unwrap();
        let marker = dir.path().join("must-not-exist");
        std::fs::write(
            dir.path().join("package.json"),
            format!(
                r#"{{"scripts":{{"test":"touch {}","unusual":"ignored"}}}}"#,
                marker.display()
            ),
        )
        .unwrap();
        std::fs::write(
            dir.path().join("Cargo.toml"),
            "invalid manifest is never evaluated",
        )
        .unwrap();
        let tasks = detect_tasks(dir.path()).unwrap();
        assert_eq!(tasks.len(), 5);
        assert_eq!(tasks[0].command, "npm run test");
        assert!(!marker.exists());
        std::fs::write(dir.path().join("package.json"), "{".repeat(1_000_001)).unwrap();
        assert!(detect_tasks(dir.path()).unwrap_err().contains("exceeds"));
    }
}
