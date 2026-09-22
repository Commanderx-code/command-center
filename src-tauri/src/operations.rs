//! Local workflow definitions, personal tools, recovery probes, and event summaries.
use crate::{
    integrations::{Plan, Request},
    platform as p,
    settings::Settings,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    process::Command,
};

#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Collection {
    pub workflows: Vec<Recipe>,
    pub profiles: Vec<Recipe>,
    pub tools: Vec<Tool>,
    pub notifications: Notifications,
}
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Recipe {
    pub dotfiles_path: String,
    pub flake_profile: String,
    pub id: String,
    pub name: String,
    pub steps: Vec<Step>,
}
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Step {
    pub name: String,
    pub request: Request,
    pub satisfied_path: String,
}
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Tool {
    pub id: String,
    pub name: String,
    pub folder: String,
    pub description: String,
    pub command: String,
    pub directory: String,
    pub mode: String,
    pub prerequisite: String,
    pub inputs: Vec<Input>,
}
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Input {
    pub name: String,
    pub label: String,
    pub kind: String,
}
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Notifications {
    pub enabled: bool,
    pub failures: bool,
    pub completions: bool,
    pub health: bool,
    pub quiet_start: u8,
    pub quiet_end: u8,
}
fn identifier(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 80
        && s.bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}
fn label(s: &str) -> bool {
    !s.trim().is_empty() && s.len() <= 160 && !s.contains(['\0', '\n', '\r'])
}
impl Collection {
    fn validate(&self) -> Result<(), String> {
        if self.workflows.len() > 30 || self.profiles.len() > 20 || self.tools.len() > 100 {
            return Err("Collection limit reached".into());
        }
        if self.notifications.quiet_start > 23 || self.notifications.quiet_end > 23 {
            return Err("Quiet hours must be between 0 and 23".into());
        }
        for recipes in [&self.workflows, &self.profiles] {
            let mut ids = BTreeSet::new();
            for recipe in recipes {
                if !identifier(&recipe.id)
                    || !ids.insert(&recipe.id)
                    || !label(&recipe.name)
                    || recipe.steps.is_empty()
                    || recipe.steps.len() > 30
                {
                    return Err("Recipes need a unique ID, name and 1–30 steps".into());
                }
                for step in &recipe.steps {
                    if !label(&step.name) || !allowed(&step.request.action) {
                        return Err("Unsupported workflow step".into());
                    }
                    if !step.satisfied_path.is_empty() {
                        p::expand(&step.satisfied_path)?;
                    }
                }
            }
        }
        let mut ids = BTreeSet::new();
        for tool in &self.tools {
            if !ids.insert(&tool.id) {
                return Err("Duplicate tool ID".into());
            }
            tool.validate()?;
        }
        if serde_json::to_vec(self).map_err(|e| e.to_string())?.len() > 500_000 {
            return Err("Collection is too large".into());
        }
        Ok(())
    }
}
fn allowed(action: &str) -> bool {
    [
        "backup-ready",
        "backup",
        "restic-check",
        "hm-build",
        "hm-switch",
        "sync-fetch",
        "sync-pull",
        "fetch",
        "toolbox",
        "custom",
        "personal-tool",
        "tool-update",
        "profile-clone",
        "health-check",
    ]
    .contains(&action)
}
impl Tool {
    fn validate(&self) -> Result<(), String> {
        if !identifier(&self.id)
            || !label(&self.name)
            || self.description.len() > 2000
            || self.folder.len() > 200
            || self.inputs.len() > 12
            || self.command.len() > 4096
        {
            return Err("Invalid personal tool fields".into());
        }
        if self.folder.split('/').any(|s| s == ".." || s == ".")
            || self.folder.contains(['\0', '\n', '\r'])
        {
            return Err("Invalid folder".into());
        }
        p::expand(&self.directory)?;
        if !["embedded", "external", "background"].contains(&self.mode.as_str()) {
            return Err("Choose an execution mode".into());
        }
        let args = shell_words::split(&self.command).map_err(|e| e.to_string())?;
        if args.is_empty() || args[0].contains(['{', '}']) {
            return Err("Use a literal executable name".into());
        }
        let mut names = BTreeSet::new();
        for field in &self.inputs {
            if !identifier(&field.name)
                || !label(&field.label)
                || !names.insert(&field.name)
                || !["text", "folder", "repository"].contains(&field.kind.as_str())
            {
                return Err("Invalid input field".into());
            }
        }
        for arg in args {
            if arg.contains(['{', '}']) {
                let key = arg
                    .strip_prefix('{')
                    .and_then(|s| s.strip_suffix('}'))
                    .ok_or("Inputs must occupy a whole argument, such as {folder}")?;
                if !names.contains(&key.to_string()) {
                    return Err("Command references an undefined input".into());
                }
            }
        }
        Ok(())
    }
    fn plan(&self, values: &BTreeMap<String, String>) -> Result<Plan, String> {
        self.validate()?;
        if !self.prerequisite.is_empty() && !p::available(&self.prerequisite) {
            return Err(format!("Install prerequisite: {}", self.prerequisite));
        }
        let mut resolved = BTreeMap::new();
        for field in &self.inputs {
            let value = values
                .get(&field.name)
                .ok_or_else(|| format!("Enter {}", field.label))?;
            if value.is_empty() || value.len() > 4096 || value.contains('\0') {
                return Err("Input must contain 1–4096 bytes".into());
            }
            let value = match field.kind.as_str() {
                "repository" => p::repo(value)?.to_string_lossy().into_owned(),
                "folder" => {
                    let path = p::expand(value)?
                        .canonicalize()
                        .map_err(|e| e.to_string())?;
                    if !path.is_dir() {
                        return Err("Select an existing directory".into());
                    }
                    path.to_string_lossy().into_owned()
                }
                _ => value.clone(),
            };
            resolved.insert(field.name.clone(), value);
        }
        let mut args = shell_words::split(&self.command).map_err(|e| e.to_string())?;
        for arg in &mut args {
            if let Some(key) = arg.strip_prefix('{').and_then(|s| s.strip_suffix('}')) {
                *arg = resolved.get(key).ok_or("Missing input")?.clone();
            }
        }
        let cwd = p::expand(&self.directory)?
            .canonicalize()
            .map_err(|e| e.to_string())?;
        if !cwd.is_dir() {
            return Err("Working folder is not a directory".into());
        }
        let mut plan = Plan::new(&self.name, &args.remove(0), args, &cwd);
        plan.interactive = self.mode == "embedded";
        plan.external_terminal = self.mode == "external";
        plan.explanation=format!("{}\nInputs are passed as literal arguments. Review the command and its effects before running.",self.description);
        Ok(plan)
    }
}
#[tauri::command]
pub fn load_operations(app: tauri::AppHandle) -> Result<Collection, String> {
    p::load(&p::data_file(&app, "operations.json")?)
}
#[tauri::command]
pub fn save_operations(app: tauri::AppHandle, collection: Collection) -> Result<(), String> {
    collection.validate()?;
    p::save(&p::data_file(&app, "operations.json")?, &collection)
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Baseline {
    pub id: String,
    pub path: String,
    pub sha256: String,
    pub recorded_at: u64,
}
#[tauri::command]
pub fn recovery_baselines(app: tauri::AppHandle) -> Result<Vec<Baseline>, String> {
    p::load(&p::data_file(&app, "recovery-baselines.json")?)
}
#[tauri::command]
pub async fn record_recovery_baseline(
    app: tauri::AppHandle,
    path: String,
) -> Result<Baseline, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = p::expand(&path)?
            .canonicalize()
            .map_err(|e| e.to_string())?;
        let meta = fs::metadata(&path).map_err(|e| e.to_string())?;
        if !path.starts_with(p::home()) || !meta.is_file() || meta.len() > 100_000_000 {
            return Err("Select a regular file below your home, up to 100 MB".into());
        }
        let (ok, out, err) = p::output(Command::new("sha256sum").arg("--").arg(&path), 30)?;
        if !ok {
            return Err(err);
        }
        let hash = out
            .trim_start_matches('\\')
            .split_whitespace()
            .next()
            .ok_or("Missing checksum")?
            .to_string();
        if hash.len() != 64 {
            return Err("Invalid checksum response".into());
        }
        let row = Baseline {
            id: p::now().to_string(),
            path: path.to_string_lossy().into_owned(),
            sha256: hash,
            recorded_at: p::now(),
        };
        let mut rows = recovery_baselines(app.clone())?;
        rows.insert(0, row.clone());
        rows.truncate(50);
        p::save(&p::data_file(&app, "recovery-baselines.json")?, &rows)?;
        Ok(row)
    })
    .await
    .map_err(|e| e.to_string())?
}
const RECOVERY_SCRIPT: &str = r#"set -euo pipefail
expected=$1; snapshot=$2; file=$3; shift 3
probe=$(mktemp -d)
trap 'rm -f -- "$probe/restored"; rmdir -- "$probe"' EXIT
restic "$@" dump "$snapshot" "$file" > "$probe/restored"
actual=$(sha256sum -- "$probe/restored")
actual=${actual%% *}
if [ "$actual" != "$expected" ]; then printf 'FAIL: restored file differs from the recorded baseline.\n'; exit 1; fi
printf 'PASS: restored file matches the recorded SHA-256 baseline. Temporary restored file removed on exit.\n'
"#;
pub fn plan(app: &tauri::AppHandle, r: &Request, s: &Settings) -> Result<Plan, String> {
    match r.action.as_str(){
 "personal-tool"=>load_operations(app.clone())?.tools.iter().find(|t|t.id==r.custom_id).ok_or("Save this tool first")?.plan(&r.inputs),
 "recovery-test"=>{
  if r.snapshot.len()<8||r.snapshot.len()>64||!r.snapshot.bytes().all(|b|b.is_ascii_hexdigit()){return Err("Enter a snapshot ID (8–64 hexadecimal characters)".into());}
  let row=recovery_baselines(app.clone())?.into_iter().find(|v|v.id==r.custom_id).ok_or("Select a recorded baseline")?;
  let mut args=vec!["-c".into(),RECOVERY_SCRIPT.into(),"recovery-test".into(),row.sha256,r.snapshot.clone(),row.path];args.extend(crate::integrations::restic_args(&s.integrations)?);
  let mut plan=Plan::new(&format!("Recovery test · {}",row.id),"bash",args,&p::home());plan.explanation="Restore the selected file from the selected snapshot into a temporary directory, compare its SHA-256 with the saved baseline, and delete that temporary copy. This verifies only this file. Restic may unlock your credential wallet.".into();Ok(plan)
 },
 "profile-clone"=>{let target=p::expand(&r.target)?;if target.exists()||!target.parent().is_some_and(|p|p.is_dir()){return Err("Clone destination must be a new folder with an existing parent".into());}
 if !r.remote.starts_with("https://")&&!r.remote.starts_with("git@"){return Err("Use an HTTPS or git@ SSH repository URL".into());}Ok(Plan::new("Clone profile repository","git",vec!["clone".into(),"--".into(),r.remote.clone(),target.to_string_lossy().into_owned()],&p::home()))},
 "backup-ready"=>{let health=crate::health::backup_report(s); if health["available"]!=true||health["data"]["drive_mounted"]!=true{return Err("Backup drive readiness is not confirmed. Connect the drive and check the health helper.".into());}let helper=p::expand(&s.integrations.backup_health_script)?;let mut plan=Plan::new("Check backup readiness","bash",vec!["-c".into(),"set -e; report=$(\"$1\" --json); printf '%s\\n' \"$report\"; test -x \"$2\"".into(),"backup-ready".into(),helper.to_string_lossy().into_owned(),p::expand(&s.integrations.backup_script)?.to_string_lossy().into_owned()],&p::home());plan.explanation="Recheck backup location and helper availability. The backup helper still performs its own checks.".into();Ok(plan)},
 "health-check"=>Ok(Plan::new("Post-maintenance service and disk check","bash",vec!["-c".into(),"set -e; df -h; systemctl --user --failed --no-pager; systemctl --failed --no-pager; test \"$(systemctl --user --failed --no-legend | wc -l)\" -eq 0; test \"$(systemctl --failed --no-legend | wc -l)\" -eq 0".into()],&p::home())),
 _=>Err("Unsupported operations action".into())
 }
}
#[tauri::command]
pub async fn assess_profile(app: tauri::AppHandle, id: String) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move||{
 let data=load_operations(app.clone())?;let profile=data.profiles.iter().find(|p|p.id==id).ok_or("Save this profile first")?;
 let settings=crate::settings::load_settings(app.clone())?.unwrap_or_default();let mut rows=Vec::new();
 for step in &profile.steps{
 let present=if !step.satisfied_path.is_empty(){p::expand(&step.satisfied_path)?.exists()}else{false};
 let ready=crate::jobs::build_plan(&app,&step.request,&settings);
 rows.push(json!({"name":step.name,"present":present,"status":if present{"Present · inspect before skipping"}else if ready.is_ok(){"Ready to review"}else{"Needs setup"},"detail":ready.err().unwrap_or_default()}));
 }Ok(json!(rows))
}).await.map_err(|e|e.to_string())?
}
#[tauri::command]
pub fn change_timeline(app: tauri::AppHandle) -> Result<Value, String> {
    let jobs: Vec<crate::jobs::Job> = p::load(&p::data_file(&app, "activity.json")?)?;
    let mut rows:Vec<Value>=jobs.iter().map(|j|json!({"time":j.finished_at.unwrap_or(j.started_at),"title":j.title,"category":j.action,"status":j.status,"detail":j.cwd,"jobId":j.id})).collect();
    for kind in ["ghostty", "fastfetch"] {
        let history = crate::configuration::configuration_history(app.clone(), kind.into())?;
        for item in history.as_array().into_iter().flatten() {
            if let Some(name) = item["name"].as_str() {
                let time = name
                    .strip_prefix(&format!("{kind}-"))
                    .and_then(|s| s.strip_suffix(".bak"))
                    .and_then(|s| s.parse::<u64>().ok())
                    .unwrap_or(0);
                rows.push(json!({"time":time,"title":format!("{kind} configuration backup"),"category":"configuration","status":"previous version saved","detail":name}));
            }
        }
    }
    rows.sort_by_key(|v| std::cmp::Reverse(v["time"].as_u64().unwrap_or(0)));
    Ok(json!(rows))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn literal_inputs_never_become_shell_source() {
        let dir = tempfile::tempdir().unwrap();
        let t = Tool {
            id: "echo".into(),
            name: "Echo".into(),
            command: "printf '%s' {value}".into(),
            directory: dir.path().to_string_lossy().into_owned(),
            mode: "background".into(),
            inputs: vec![Input {
                name: "value".into(),
                label: "Value".into(),
                kind: "text".into(),
            }],
            ..Default::default()
        };
        let values =
            BTreeMap::from([("value".into(), "$(touch /tmp/not-executed); spaces".into())]);
        let plan = t.plan(&values).unwrap();
        assert_eq!(plan.program, "printf");
        assert_eq!(plan.args[1], values["value"]);
        let mut invalid = t;
        invalid.command = "echo prefix{value}".into();
        assert!(invalid.validate().is_err());
    }
    #[test]
    fn rejects_bad_workflows() {
        let mut c = Collection::default();
        c.workflows.push(Recipe {
            id: "a".into(),
            name: "A".into(),
            dotfiles_path: String::new(),
            flake_profile: String::new(),
            steps: vec![Step {
                name: "unsafe".into(),
                request: Request {
                    action: "unknown".into(),
                    ..Default::default()
                },
                ..Default::default()
            }],
        });
        assert!(c.validate().is_err());
        c.workflows[0].steps[0].request.action = "backup".into();
        assert!(c.validate().is_ok());
    }
}

#[cfg(test)]
mod recovery_tests {
    use super::*;
    #[test]
    fn recovery_probe_matches_snapshot_and_rejects_wrong_hash() {
        if !p::available("restic") {
            return;
        }
        let dir = tempfile::tempdir().unwrap();
        let repo = dir.path().join("repo");
        let source = dir.path().join("probe.txt");
        fs::write(&source, "known recovery contents\n").unwrap();
        let run_restic = |args: Vec<String>| {
            let output = Command::new("restic")
                .env_remove("RESTIC_PASSWORD_COMMAND")
                .env_remove("RESTIC_PASSWORD_FILE")
                .env("RESTIC_PASSWORD", "fixture-only")
                .arg("-r")
                .arg(&repo)
                .args(args)
                .output()
                .unwrap();
            assert!(
                output.status.success(),
                "{}",
                String::from_utf8_lossy(&output.stderr)
            );
            output.stdout
        };
        run_restic(vec!["init".into()]);
        run_restic(vec!["backup".into(), source.to_string_lossy().into_owned()]);
        let snapshots: Value =
            serde_json::from_slice(&run_restic(vec!["snapshots".into(), "--json".into()])).unwrap();
        let hash = Command::new("sha256sum").arg(&source).output().unwrap();
        let hash = String::from_utf8(hash.stdout)
            .unwrap()
            .split_whitespace()
            .next()
            .unwrap()
            .to_string();
        for (expected, success) in [(hash, true), ("0".repeat(64), false)] {
            let output = Command::new("bash")
                .env_remove("RESTIC_PASSWORD_COMMAND")
                .env_remove("RESTIC_PASSWORD_FILE")
                .env("RESTIC_PASSWORD", "fixture-only")
                .args([
                    "-c",
                    RECOVERY_SCRIPT,
                    "test",
                    &expected,
                    snapshots[0]["id"].as_str().unwrap(),
                    source.to_str().unwrap(),
                    "-r",
                    repo.to_str().unwrap(),
                ])
                .output()
                .unwrap();
            assert_eq!(
                output.status.success(),
                success,
                "{}",
                String::from_utf8_lossy(&output.stderr)
            );
        }
        assert_eq!(
            fs::read_to_string(source).unwrap(),
            "known recovery contents\n"
        );
    }
}
