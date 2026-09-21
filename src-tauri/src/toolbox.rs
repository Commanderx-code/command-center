//! Adapter for the pinned Toolbox core. The worker owns its non-Send tree and
//! extraction guard for the app lifetime; scripts and relative imports stay alive.
use crate::integrations::{Plan, Request};
use linutil_core::{Command, TabList};
use serde::Serialize;
use std::{collections::BTreeSet, sync::mpsc, thread};

pub const REVISION: &str = "880b79c26bd475af018d98ae7dea5d206a0b211d";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Action {
    pub id: String,
    pub name: String,
    pub category: String,
    pub groups: Vec<String>,
    pub description: String,
    pub task_list: String,
    pub multi_select: bool,
    pub available: bool,
    #[serde(skip)]
    plan: Plan,
}
#[derive(Serialize)]
pub struct Catalog {
    pub revision: &'static str,
    pub actions: Vec<Action>,
}
enum Query {
    Catalog(mpsc::Sender<Result<Catalog, String>>),
    Plan(String, mpsc::Sender<Result<Plan, String>>),
}
pub struct Toolbox(mpsc::Sender<Query>);

fn flatten(tabs: &TabList) -> Vec<Action> {
    let mut actions = Vec::new();
    for tab in tabs.iter() {
        for node in tab.tree.nodes() {
            let data = node.value();
            let (program, args, cwd) = match &data.command {
                Command::None => continue,
                Command::Raw(command) => (
                    "/bin/sh".to_owned(),
                    vec!["-e".into(), "-c".into(), command.clone()],
                    crate::platform::home(),
                ),
                Command::LocalFile { executable, args, file } => {
                    let mut args = args.clone();
                    // Core's fallback shebang omits the script argument.
                    if args.last().map(String::as_str) != file.to_str() {
                        args.push(file.to_string_lossy().into_owned());
                    }
                    (executable.clone(), args, file.parent().unwrap_or(file).to_owned())
                }
            };
            let mut groups: Vec<_> = node.ancestors()
                .filter(|n| n.parent().is_some())
                .map(|n| n.value().name.clone()).collect();
            groups.reverse();
            let mut key = vec![tab.name.clone()];
            key.extend(groups.clone());
            key.push(data.name.clone());
            let mut plan = Plan::new(&data.name, &program, args, &cwd);
            plan.timeout_seconds = 86400;
            plan.interactive = true;
            plan.explanation = format!("{}\n\nRuns the bundled Commander Toolbox script with its existing prompts and privilege checks. Terminal input and output are not saved in Activity.", data.description);
            actions.push(Action {
                id: serde_json::to_string(&key).unwrap_or_default(),
                name: data.name.clone(), category: tab.name.clone(), groups,
                description: data.description.clone(), task_list: data.task_list.clone(),
                multi_select: data.multi_select, available: false, plan,
            });
        }
    }
    actions
}
fn load_tabs(validate: bool) -> Result<TabList, String> {
    std::panic::catch_unwind(|| linutil_core::get_tabs(validate))
        .map_err(|_| "Could not load the bundled Toolbox catalog".into())
}
fn supported() -> Result<BTreeSet<String>, String> {
    Ok(flatten(&load_tabs(true)?).into_iter().map(|a| a.id).collect())
}
fn checked_plan(actions: &[Action], supported: &BTreeSet<String>, id: &str) -> Result<Plan, String> {
    let action = actions.iter().find(|a| a.id == id).ok_or("Unknown Toolbox action")?;
    if !supported.contains(id) {
        return Err("This action's Toolbox preconditions or interpreter are not available on this machine. Refresh the catalog.".into());
    }
    Ok(action.plan.clone())
}
impl Default for Toolbox {
    fn default() -> Self {
        let (sender, receiver) = mpsc::channel();
        thread::spawn(move || {
            let tabs = load_tabs(false);
            let actions = tabs.as_ref().map(flatten).map_err(Clone::clone);
            for query in receiver {
                match query {
                    Query::Catalog(reply) => {
                        let result = actions.clone().and_then(|mut actions| {
                            let supported = supported()?;
                            for action in &mut actions { action.available = supported.contains(&action.id); }
                            Ok(Catalog { revision: REVISION, actions })
                        });
                        let _ = reply.send(result);
                    }
                    Query::Plan(id, reply) => {
                        let result = actions.as_ref().map_err(Clone::clone)
                            .and_then(|actions| checked_plan(actions, &supported()?, &id));
                        let _ = reply.send(result);
                    }
                }
            }
            drop(tabs);
        });
        Self(sender)
    }
}
impl Toolbox {
    fn catalog(&self) -> Result<Catalog, String> {
        let (tx, rx) = mpsc::channel();
        self.0.send(Query::Catalog(tx)).map_err(|e| e.to_string())?;
        rx.recv().map_err(|e| e.to_string())?
    }
    pub fn plan(&self, request: &Request) -> Result<Plan, String> {
        if !["embedded", "external"].contains(&request.terminal_mode.as_str()) {
            return Err("Choose an embedded or external terminal".into());
        }
        let (tx, rx) = mpsc::channel();
        self.0.send(Query::Plan(request.tool_id.clone(), tx)).map_err(|e| e.to_string())?;
        let mut plan = rx.recv().map_err(|e| e.to_string())??;
        plan.external_terminal = request.terminal_mode == "external";
        Ok(plan)
    }
}
#[tauri::command]
pub async fn toolbox_catalog(app: tauri::AppHandle) -> Result<Catalog, String> {
    use tauri::Manager;
    tauri::async_runtime::spawn_blocking(move || app.state::<Toolbox>().catalog())
        .await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn shared_catalog_is_complete_unique_and_scripts_survive_requests() {
        let toolbox = Toolbox::default();
        let catalog = toolbox.catalog().unwrap();
        assert_eq!(catalog.actions.len(), 215);
        let ids: BTreeSet<_> = catalog.actions.iter().map(|a| &a.id).collect();
        assert_eq!(ids.len(), catalog.actions.len());
        for action in &catalog.actions {
            assert!(std::path::Path::new(&action.plan.cwd).is_dir());
            assert!(std::path::Path::new(action.plan.args.last().unwrap()).is_file());
        }
        let action = catalog.actions.iter().find(|a| a.available).unwrap();
        let request = Request { action: "toolbox".into(), tool_id: action.id.clone(), terminal_mode: "embedded".into(), ..Default::default() };
        let first = toolbox.plan(&request).unwrap();
        let second = toolbox.plan(&request).unwrap();
        assert_eq!(first.args, second.args);
        assert!(first.interactive && !first.external_terminal);
        let external = toolbox.plan(&Request { terminal_mode: "external".into(), ..request }).unwrap();
        assert!(external.external_terminal);
        assert!(checked_plan(&catalog.actions, &BTreeSet::new(), &action.id).is_err());
        assert!(checked_plan(&catalog.actions, &supported().unwrap(), "../../bad").is_err());
    }
}
