use crate::{integrations::{Plan, Request}, platform as p, settings::Settings};
use serde::{Deserialize, Serialize};
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomAction {
    pub id: String,
    pub name: String,
    pub command: String,
    pub directory: String,
    pub shell: String,
    pub mode: String,
}
impl CustomAction {
    pub fn validate(&self) -> Result<(), String> {
        if self.id.is_empty() || self.id.len() > 80 || !self.id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_') { return Err("Invalid custom action ID".into()); }
        if self.name.trim().is_empty() || self.name.chars().count() > 80 || self.name.contains(['\0','\n','\r']) { return Err("Action names must contain 1–80 characters".into()); }
        if self.command.trim().is_empty() || self.command.len() > 4096 || self.command.contains('\0') { return Err("Commands must contain 1–4096 bytes".into()); }
        if self.directory.len() > 4096 || self.directory.contains(['\0','\n','\r']) { return Err("Invalid working folder".into()); }
        p::expand(&self.directory)?;
        if !["direct", "fish", "bash"].contains(&self.shell.as_str()) || !["embedded", "external", "background"].contains(&self.mode.as_str()) { return Err("Invalid custom action shell or execution mode".into()); }
        if self.shell == "direct" && shell_words::split(&self.command).map_err(|e|e.to_string())?.is_empty() { return Err("Enter a command".into()); }
        Ok(())
    }
}
pub fn plan(request: &Request, settings: &Settings) -> Result<Plan, String> {
    let action = settings.custom_actions.iter().find(|a|a.id == request.custom_id).ok_or("Save this custom action in Settings before running it")?;
    action.validate()?;
    let cwd = p::expand(&action.directory)?.canonicalize().map_err(|e|format!("Working folder unavailable: {e}"))?;
    if !cwd.is_dir() { return Err("Working folder must be a directory".into()); }
    let (program, args) = if action.shell == "direct" {
        let mut parts = shell_words::split(&action.command).map_err(|e|e.to_string())?;
        (parts.remove(0), parts)
    } else {
        // Interactive shell initialization loads user functions; the script still gets an explicit command.
        (action.shell.clone(), vec!["-ic".into(), action.command.clone()])
    };
    let mut plan = Plan::new(&action.name, &program, args, &cwd);
    plan.interactive = action.mode == "embedded";
    plan.external_terminal = action.mode == "external";
    plan.explanation = "Run this saved custom command with your user permissions. Review the full command and working folder. Choose a terminal mode for password prompts or interactive programs.".into();
    Ok(plan)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn action(path: &str) -> CustomAction {
        CustomAction { id:"fixture".into(), name:"Fixture".into(), command:"printf '%s' 'a b'".into(), directory:path.into(), shell:"direct".into(), mode:"background".into() }
    }
    #[test]
    fn plans_saved_commands_without_executing_them() {
        let dir=tempfile::tempdir().unwrap();
        let mut settings=Settings::default(); settings.custom_actions.push(action(dir.path().to_str().unwrap()));
        let request=Request { action:"custom".into(),custom_id:"fixture".into(),..Default::default() };
        let p=plan(&request,&settings).unwrap(); assert_eq!(p.program,"printf"); assert_eq!(p.args,vec!["%s","a b"]); assert!(!p.interactive);
        settings.custom_actions[0].shell="fish".into(); settings.custom_actions[0].mode="embedded".into();
        let p=plan(&request,&settings).unwrap(); assert_eq!(p.program,"fish"); assert!(p.interactive); assert_eq!(p.args[0],"-ic");
        settings.custom_actions[0].mode="external".into(); assert!(plan(&request,&settings).unwrap().external_terminal);
        settings.custom_actions[0].directory="relative".into(); assert!(settings.validate().is_err());
    }
}
