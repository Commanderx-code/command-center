use crate::platform as p;
use serde_json::{json,Value};
use std::{fs,io::Write,process::Command};
use tauri::Manager;
const PAGE:&str="https://github.com/Commanderx-code/command-center/releases";
#[tauri::command]
pub fn release_info()->Value {json!({"installed":env!("CARGO_PKG_VERSION")})}
#[tauri::command]
pub async fn check_release()->Result<Value,String>{
    tauri::async_runtime::spawn_blocking(|| {
        let (ok,text,error)=p::output(Command::new("curl").args(["--silent","--show-error","--max-time","20","--max-filesize","1000000","--proto","=https","--header","Accept: application/vnd.github+json","--user-agent","Command-Center","--write-out","\n%{http_code}","https://api.github.com/repos/Commanderx-code/command-center/releases/latest"]),25)?;
        if !ok{return Err(format!("Release check failed: {error}"));}
        let (body,status)=text.rsplit_once('\n').ok_or("Invalid release response")?;
        if status=="404" {return Ok(json!({"installed":env!("CARGO_PKG_VERSION"),"release":null}));}
        if status!="200" {return Err(format!("GitHub returned HTTP {status}; try again later"));}
        let data:Value=serde_json::from_str(body).map_err(|e|e.to_string())?;
        if data["draft"]!=false || data["prerelease"]!=false {return Err("No stable published release in response".into());}
        Ok(json!({"installed":env!("CARGO_PKG_VERSION"),"release":{"tag":data["tag_name"],"notes":data["body"],"publishedAt":data["published_at"]}}))
    }).await.map_err(|e|e.to_string())?
}
#[tauri::command]
pub fn open_releases()->Result<(),String>{open::that(PAGE).map_err(|e|e.to_string())}
#[tauri::command]
pub fn export_update_helper(app:tauri::AppHandle)->Result<String,String>{
    let folder=app.path().download_dir().map_err(|e|e.to_string())?;
    fs::create_dir_all(&folder).map_err(|e|e.to_string())?;
    let path=folder.join("update-desktop.sh");
    let mut file=fs::OpenOptions::new().write(true).create_new(true).open(&path).map_err(|e|format!("Could not create {}: {e}. Move any existing helper before exporting again.",path.display()))?;
    file.write_all(include_bytes!("../../scripts/update-desktop.sh")).map_err(|e|e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}
