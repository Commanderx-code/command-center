use crate::{integrations::{Plan,Request},platform as p};
use serde_json::{json,Value};
use std::process::Command;
const SOURCE:&str="https://github.com/Commanderx-code/commander-toolbox.git";
fn sha(value:&str)->bool {value.len()==40&&value.bytes().all(|b|b.is_ascii_hexdigit())}
fn probe(program:&str,args:&[&str],empty_exit:bool)->Value {
    if !p::available(program){return json!({"state":"unavailable","output":"","detail":format!("{program} is not installed")});}
    match p::output(Command::new(program).args(args).env("LC_ALL","C"),30){
        Ok((ok,out,err)) if ok || (empty_exit && out.trim().is_empty() && err.trim().is_empty()) => {
            if !err.trim().is_empty(){return json!({"state":"warning","output":out,"detail":err});}
            json!({"state":if out.trim().is_empty(){"none-reported"}else{"results"},"output":out,"detail":""})
        },
        Ok((_,out,err))=>json!({"state":"error","output":out,"detail":if err.is_empty(){"Query failed without a diagnostic".into()}else{err}}),
        Err(error)=>json!({"state":"error","output":"","detail":error})
    }
}
fn full_upgrade()->bool {
    p::available("fish") && matches!(p::output(Command::new("fish").args(["-ic","type -q full-upgrade"]),10),Ok((true,_,_)))
}
#[tauri::command]
pub async fn toolbox_update_checks()->Result<Value,String>{
    tauri::async_runtime::spawn_blocking(|| {
        let mut groups=Vec::new();
        let fresh=p::available("checkupdates");
        let arch=if fresh {
            // checkupdates uses a separate database; exit 2 means no updates.
            probe("sh",&["-c",r#"checkupdates; result=$?; if [ "$result" -eq 2 ]; then exit 0; fi; exit "$result""#],false)
        } else {probe("pacman",&["-Qu"],true)};
        groups.push(json!({"id":"arch","name":"Arch repository packages","note":if fresh {"Fresh check using checkupdates and its separate database; no packages installed. Includes all Arch repository packages."}else{"Cached database only: checkupdates is unavailable. Includes system packages, not just Toolbox tools. No system database refresh is performed."},"check":arch}));
        for (id,scope) in [("flatpak-user","--user"),("flatpak-system","--system")] {
            groups.push(json!({"id":id,"name":format!("Flatpak {scope}"),"note":"Checks configured remotes for installed app/runtime updates. Additional named system installations are not included.","check":probe("flatpak",&["remote-ls",scope,"--updates","--columns=application,version,branch"],false)}));
        }
        groups.push(json!({"id":"foreign","name":"Foreign / AUR packages · manual review","note":"Installed packages outside configured pacman repositories. This is an inventory, not an update check. Use your configured AUR updater or full-upgrade workflow.","check":probe("pacman",&["-Qm"],true)}));
        let full=full_upgrade();
        Ok(json!({"checkedAt":p::now(),"groups":groups,"workflows":{"fullUpgrade":full,"topgrade":p::available("topgrade"),"garuda":p::available("garuda-update"),"arch":p::available("pacman")&&p::available("sudo"),"flatpak":p::available("flatpak")},"manual":"Standalone binaries, source builds, language-package installs and other installers are not mapped to Toolbox entries. Their update status is unknown; use their documented updater or a saved custom action."}))
    }).await.map_err(|e|e.to_string())?
}
#[tauri::command]
pub async fn toolbox_catalog_update()->Result<Value,String>{
    tauri::async_runtime::spawn_blocking(|| {
        let (ok,out,err)=p::output(Command::new("git").args(["ls-remote","--symref",SOURCE,"HEAD"]).env("GIT_TERMINAL_PROMPT","0"),25)?;
        if !ok{return Err(format!("Catalog check failed: {err}"));}
        let latest=out.lines().find_map(|line|{let mut parts=line.split_whitespace();let id=parts.next()?;if sha(id)&&parts.next()==Some("HEAD"){Some(id)}else{None}}).ok_or("No default branch revision returned")?;
        Ok(json!({"bundled":crate::toolbox::REVISION,"latest":latest,"different":latest!=crate::toolbox::REVISION,"checkedAt":p::now()}))
    }).await.map_err(|e|e.to_string())?
}
#[tauri::command]
pub fn toolbox_compare(revision:String)->Result<(),String>{
    if !sha(&revision){return Err("Invalid catalog revision".into());}
    open::that(format!("https://github.com/Commanderx-code/commander-toolbox/compare/{}...{}",crate::toolbox::REVISION,revision)).map_err(|e|e.to_string())
}
pub fn plan(r:&Request)->Result<Plan,String>{
    let (name,program,args):(&str,&str,Vec<&str>)=match r.tool_id.as_str(){
        "full-upgrade"=>{if !full_upgrade(){return Err("full-upgrade is unavailable in your interactive fish shell".into());}("Full upgrade workflow","fish",vec!["-ic","full-upgrade"])},
        "topgrade"=>("Topgrade workflow","topgrade",vec![]),
        "garuda"=>("Garuda system update","garuda-update",vec![]),
        "arch"=>("Arch system update","sudo",vec!["pacman","-Syu"]),
        "flatpak-user"=>("User Flatpak updates","flatpak",vec!["update","--user"]),
        "flatpak-system"=>("System Flatpak updates","flatpak",vec!["update","--system"]),
        _=>return Err("Unsupported update workflow".into())
    };
    if !p::available(program)||(r.tool_id=="arch"&&!p::available("pacman")){return Err("Updater is unavailable; check tools again".into());}
    if !["embedded","external"].contains(&r.terminal_mode.as_str()){return Err("Choose an interactive terminal for updates".into());}
    let mut plan=Plan::new(name,program,args.into_iter().map(String::from).collect(),&p::home());
    plan.interactive=r.terminal_mode=="embedded";plan.external_terminal=r.terminal_mode=="external";plan.timeout_seconds=24*3600;
    plan.explanation="Updates this package source or runs your existing configured workflow. Scope can include the whole system, not just Toolbox tools. Package lists may change since the check. Review the updater's own prompts; no automatic yes flags are added. Full-upgrade/Topgrade obey your configuration and can run custom steps. Choose one broad workflow or individual managers to avoid duplicate updates. Embedded output is available in the terminal; external output remains in your terminal.".into();
    Ok(plan)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn rejects_unknown_workflows_and_bad_revisions(){
        assert!(sha("0123456789abcdef0123456789abcdef01234567"));
        assert!(!sha("main; id"));
        assert!(plan(&Request{tool_id:"shell-command".into(),..Default::default()}).is_err());
    }
}
