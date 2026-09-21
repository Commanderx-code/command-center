use crate::{integrations::{Plan, Request}, platform as p, settings::Settings};
use serde_json::{json, Value};
use std::{fs, process::Command, os::unix::fs::PermissionsExt};
use tauri::Manager;
fn output(program: &str, args: &[&str]) -> Result<String,String> {
    let (ok,out,err)=p::output(Command::new(program).args(args).env("LC_ALL","C"),15)?;
    if !ok { return Err(if err.trim().is_empty(){format!("{program} failed")}else{err}); }
    if out.len()>=4_000_000 {return Err("Response exceeds the display limit; use your terminal".into());}
    Ok(out)
}
fn scope_args<'a>(scope: &str) -> Result<Vec<&'a str>,String> {
    match scope { "user"=>Ok(vec!["--user"]), "system"=>Ok(vec!["--system"]), _=>Err("Unknown service scope".into()) }
}
fn unit_name(unit: &str) -> Result<(),String> {
    if unit.len()>255 || !(unit.ends_with(".service")||unit.ends_with(".timer")) || unit.starts_with('-') || !unit.bytes().all(|b|b.is_ascii_alphanumeric()||b"@_.:-\\+".contains(&b)) {return Err("Invalid service or timer name".into());} Ok(())
}
fn properties(text: &str) -> Vec<Value> {
    text.trim().split("\n\n").filter(|part|!part.trim().is_empty()).map(|part|{
        let mut object=serde_json::Map::new();
        for line in part.lines(){if let Some((k,v))=line.split_once('='){object.insert(k.into(),json!(v));}}
        Value::Object(object)
    }).collect()
}
fn list(scope:&str, kind:&str) -> Result<Vec<Value>,String> {
    let mut args=scope_args(scope)?;
    args.extend(["list-units","--all","--plain","--no-legend","--no-pager","--full","--type",kind]);
    let text=output("systemctl",&args)?;
    let mut rows: Vec<Value> = text.lines().filter_map(|line| {
        let cols:Vec<_>=line.split_whitespace().collect();
        if cols.len()<4{return None;}
        Some(json!({"unit":cols[0],"load":cols[1],"active":cols[2],"sub":cols[3],"description":cols[4..].join(" ")}))
    }).collect();
    let mut args=scope_args(scope)?;
    args.extend(["list-unit-files","--no-legend","--no-pager","--full","--type",kind]);
    let files=output("systemctl",&args)?;
    for line in files.lines(){
        let cols:Vec<_>=line.split_whitespace().collect();
        if cols.len()<2 || cols[0].contains("@.") || rows.iter().any(|row|row["unit"]==cols[0]){continue;}
        rows.push(json!({"unit":cols[0],"load":"installed","active":"not loaded","sub":cols[1],"description":"Installed unit"}));
    }
    rows.sort_by(|a,b|a["unit"].as_str().cmp(&b["unit"].as_str()));
    Ok(rows)
}
#[tauri::command]
pub async fn system_units(scope:String, timers:bool) -> Result<Value,String> {
    tauri::async_runtime::spawn_blocking(move || {
        let owned_calendar = fs::read_to_string(p::config_home().join("systemd/user/command-center-backup.timer")).ok().filter(|text|text.starts_with("# Managed by Command Center\n")).and_then(|text|text.lines().find_map(|line|line.strip_prefix("OnCalendar=").map(String::from)));
        let units=list(&scope,if timers{"timer"}else{"service"})?;
        if !timers{return Ok(json!({"units":units,"checkedAt":p::now()}));}
        let names:Vec<_>=units.iter().take(100).filter_map(|u|u["unit"].as_str()).collect();
        if names.is_empty(){return Ok(json!({"units":[],"ownedCalendar":owned_calendar,"checkedAt":p::now()}));}
        let mut args=scope_args(&scope)?;
        args.extend(["show","--no-pager","--property=Id,ActiveState,UnitFileState,NextElapseUSecRealtime,LastTriggerUSec,Unit,TimersCalendar"]);
        args.extend(names);
        let mut timers=properties(&output("systemctl",&args)?);
        let targets:Vec<String>=timers.iter().filter_map(|v|v["Unit"].as_str().filter(|s|!s.is_empty()).map(String::from)).collect();
        if !targets.is_empty(){
            let mut args=scope_args(&scope)?;args.extend(["show","--no-pager","--property=Id,Result,ExecMainStatus,ActiveState"]);args.extend(targets.iter().map(String::as_str));
            let statuses=properties(&output("systemctl",&args)?);
            for timer in &mut timers {timer["service"]=statuses.iter().find(|s|s["Id"]==timer["Unit"]).cloned().unwrap_or(Value::Null);}
        }
        Ok(json!({"units":timers,"ownedCalendar":owned_calendar,"limited":units.len()>100,"checkedAt":p::now()}))
    }).await.map_err(|e|e.to_string())?
}
#[tauri::command]
pub async fn unit_details(scope:String, unit:String) -> Result<Value,String> {
    tauri::async_runtime::spawn_blocking(move||{
        unit_name(&unit)?;
        let mut args=scope_args(&scope)?;args.extend(["show","--no-pager","--property=Id,Description,LoadState,ActiveState,SubState,UnitFileState,Result,ExecMainStatus,FragmentPath,Triggers,TriggeredBy,RequiredBy,WantedBy",&unit]);
        let details=output("systemctl",&args)?;
        let mut journal=if scope=="user"{vec!["--user"]}else{vec![]};journal.extend(["--no-pager","--lines=100","--output=short-iso","--unit",&unit]);
        let logs=output("journalctl",&journal);
        Ok(json!({"details":details,"logs":logs.as_ref().ok(),"logError":logs.err()}))
    }).await.map_err(|e|e.to_string())?
}
pub fn plan(r:&Request,s:&Settings)->Result<Plan,String>{
    if r.action=="schedule-save" {return schedule_plan(r,s);}
    if r.scope!="user" {return Err("Service changes are limited to your user services".into());}
    unit_name(&r.unit)?;
    let verb=match r.action.as_str(){"service-start"=>"start","service-stop"=>"stop","service-restart"=>"restart","timer-enable"=>"enable","timer-disable"=>"disable",_=>return Err("Unsupported service action".into())};
    if verb=="enable"||verb=="disable" {if !r.unit.ends_with(".timer"){return Err("Select a timer".into());}}
    let loaded=output("systemctl",&["--user","show","--property=LoadState","--value",&r.unit])?;
    if loaded.trim()!="loaded"{return Err("Unit is not loaded; refresh the service list".into());}
    let mut args=vec!["--user".into(),verb.into()];
    if verb=="enable"||verb=="disable"{args.push("--now".into());}
    args.extend(["--".into(),r.unit.clone()]);
    let mut plan=Plan::new(&format!("{verb} {}",r.unit),"systemctl",args,&p::home());
    plan.explanation="Change this user unit through systemd. Enable/disable also starts/stops the timer; stopping a timer does not stop an already running backup. Service stop/restart can interrupt work in that service.".into();
    Ok(plan)
}
fn calendar(r:&Request)->Result<String,String>{
    if r.hour>23||r.minute>59{return Err("Choose a valid hour and minute".into());}
    match r.schedule.as_str(){"hourly"=>Ok(format!("*-*-* *:{:02}:00",r.minute)),"daily"=>Ok(format!("*-*-* {:02}:{:02}:00",r.hour,r.minute)),"weekly"=>Ok(format!("Sun *-*-* {:02}:{:02}:00",r.hour,r.minute)),_=>Err("Choose hourly, daily, or weekly".into())}
}
fn schedule_plan(r:&Request,s:&Settings)->Result<Plan,String>{
    let script=p::expand(&s.integrations.backup_script)?.canonicalize().map_err(|e|e.to_string())?;
    let metadata=fs::metadata(&script).map_err(|e|e.to_string())?;
    if !metadata.is_file()||metadata.permissions().mode()&0o111==0{return Err("Configure an executable personal backup helper first".into());}
    let script=script.to_str().ok_or("Helper path must be UTF-8")?;
    if script.contains(['\n','\r','"','\\','$','%']){return Err("Helper path contains characters not supported by the timer editor".into());}
    let folder=p::config_home().join("systemd/user");
    // App-owned names only. Never overwrite an existing foreign unit or a symlink.
    for name in ["command-center-backup.service","command-center-backup.timer"] {
        let file=folder.join(name);
        if let Ok(meta)=fs::symlink_metadata(&file){
            if !meta.is_file()||meta.file_type().is_symlink()||!fs::read_to_string(&file).map_err(|e|e.to_string())?.starts_with("# Managed by Command Center\n"){return Err(format!("{name} already exists and is not managed by Command Center"));}
        }
    }
    let service=format!("# Managed by Command Center\n[Unit]\nDescription=Command Center personal backup\n\n[Service]\nType=oneshot\nExecStart=\"{script}\"\n");
    let timer=format!("# Managed by Command Center\n[Unit]\nDescription=Command Center backup schedule\n\n[Timer]\nOnCalendar={}\nPersistent=true\nUnit=command-center-backup.service\n\n[Install]\nWantedBy=timers.target\n",calendar(r)?);
    let shell=r#"set -eu
umask 077
folder=$1; service=$2; timer=$3
mkdir -p "$folder"
for name in command-center-backup.service command-center-backup.timer; do
  file="$folder/$name"
  if [ -e "$file" ] || [ -L "$file" ]; then
    [ -f "$file" ] && [ ! -L "$file" ] && [ "$(head -n 1 "$file")" = '# Managed by Command Center' ] || exit 1
    backup=$(mktemp "$folder/.cc-backup.XXXXXX")
    cp -- "$file" "$backup"
    mv -T -- "$backup" "$file.bak"
  fi
done
tmp_service=$(mktemp "$folder/.cc-service.XXXXXX")
tmp_timer=$(mktemp "$folder/.cc-timer.XXXXXX")
trap 'rm -f -- "$tmp_service" "$tmp_timer"' EXIT
printf '%s' "$service" > "$tmp_service"
printf '%s' "$timer" > "$tmp_timer"
mv -T -- "$tmp_service" "$folder/command-center-backup.service"
mv -T -- "$tmp_timer" "$folder/command-center-backup.timer"
systemctl --user daemon-reload
systemctl --user enable command-center-backup.timer
systemctl --user restart command-center-backup.timer
"#;
    let mut plan=Plan::new("Save backup schedule","sh",vec!["-c".into(),shell.into(),"command-center-schedule".into(),folder.to_string_lossy().into_owned(),service,timer],&p::home());
    plan.explanation=format!("Schedule: {} (local time). Create or update Command Center's user backup timer. Previous app-owned units get .bak copies. Uses your personal backup helper and local time. Persistent timers catch up after missed runs. The user service manager must be running; this does not enable login lingering. The helper must work unattended with its existing credentials. Other backup timers are unchanged; check for duplicate schedules.",calendar(r)?);
    Ok(plan)
}
fn probe(program:&str,args:&[&str])->Value{
    match p::output(Command::new(program).args(args).env("LC_ALL","C"),5){Ok((true,out,_))=>json!({"available":true,"output":out}),Ok((_,_,err))=>json!({"available":false,"error":err}),Err(err)=>json!({"available":false,"error":err})}
}
#[tauri::command]
pub async fn system_inventory()->Result<Value,String>{
    tauri::async_runtime::spawn_blocking(move||{
        let os=fs::read_to_string("/etc/os-release").unwrap_or_default();
        let memory=fs::read_to_string("/proc/meminfo").unwrap_or_default();
        let mut versions=serde_json::Map::new();
        for tool in ["git","fish","bash","node","npm","rustc","cargo","restic","systemctl","home-manager"]{versions.insert(tool.into(),probe(tool,&["--version"]));}
        Ok(json!({"format":"command-center-inventory","version":1,"checkedAt":p::now(),"os":os,"kernel":probe("uname",&["-r"]),"cpu":probe("lscpu",&[]),"memory":memory.lines().filter(|l|l.starts_with("MemTotal:")||l.starts_with("MemAvailable:")||l.starts_with("SwapTotal:")||l.starts_with("SwapFree:")).collect::<Vec<_>>().join("\n"),"storage":probe("lsblk",&["--output","NAME,TYPE,SIZE,FSTYPE,MOUNTPOINTS"]),"diskUsage":probe("df",&["-hP"]),"tools":versions}))
    }).await.map_err(|e|e.to_string())?
}
#[tauri::command]
pub fn export_inventory(app:tauri::AppHandle,report:Value)->Result<String,String>{
    if report["format"]!="command-center-inventory" {return Err("Refresh inventory before exporting".into());}
    let data=serde_json::to_vec_pretty(&report).map_err(|e|e.to_string())?;
    if data.len()>1_000_000{return Err("Inventory report is too large".into());}
    let folder=app.path().download_dir().map_err(|e|e.to_string())?;fs::create_dir_all(&folder).map_err(|e|e.to_string())?;
    let path=folder.join(format!("command-center-inventory-{}.json",p::now()));p::atomic_write(&path,&data)?;
    Ok(path.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_unsafe_units_and_invalid_schedule_fields(){
        for unit in ["--all","../bad.service","a*.service","bad\n.service"]{assert!(unit_name(unit).is_err());}
        assert!(unit_name("backup-personal.service").is_ok());assert!(unit_name("app@work.timer").is_ok());
        let mut request=Request{schedule:"daily".into(),hour:3,minute:15,..Default::default()};
        assert_eq!(calendar(&request).unwrap(),"*-*-* 03:15:00");request.hour=24;assert!(calendar(&request).is_err());
    }
    #[test]
    fn parses_property_blocks_without_splitting_values_on_equals(){
        let rows=properties("Id=a.timer\nTimersCalendar=OnCalendar=weekly\n\nId=b.timer\nActiveState=inactive\n");
        assert_eq!(rows.len(),2);assert_eq!(rows[0]["TimersCalendar"],"OnCalendar=weekly");
    }
}

#[tauri::command]
pub fn export_service_cleanup(app:tauri::AppHandle)->Result<String,String>{
    let folder=app.path().download_dir().map_err(|e|e.to_string())?;
    fs::create_dir_all(&folder).map_err(|e|e.to_string())?;
    let path=folder.join("service-cleanup.sh");
    // Refuse replacement of a user's existing file or symlink.
    use std::io::Write;
    let mut file=fs::OpenOptions::new().write(true).create_new(true).open(&path)
        .map_err(|e|format!("Could not create {}: {e}. Move any existing helper before exporting again.",path.display()))?;
    file.write_all(include_bytes!("../../scripts/service-cleanup.sh")).map_err(|e|e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}
