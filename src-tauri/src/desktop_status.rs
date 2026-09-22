use crate::{
    operations::{load_operations, Notifications},
    platform as p,
};
use std::{process::Command, sync::Mutex};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager,
};
#[derive(Default)]
pub struct HealthNotice(pub Mutex<String>);
pub fn quiet(n: &Notifications, hour: u8) -> bool {
    if n.quiet_start == n.quiet_end {
        false
    } else if n.quiet_start < n.quiet_end {
        hour >= n.quiet_start && hour < n.quiet_end
    } else {
        hour >= n.quiet_start || hour < n.quiet_end
    }
}
fn notify(app: &tauri::AppHandle, title: &str, body: &str) -> Result<(), String> {
    let n = load_operations(app.clone())?.notifications;
    if !n.enabled {
        return Ok(());
    }
    let hour = unsafe {
        let time = libc::time(std::ptr::null_mut());
        let mut local = std::mem::zeroed();
        if libc::localtime_r(&time, &mut local).is_null() {
            return Err("Could not read local time".into());
        }
        local.tm_hour as u8
    };
    if quiet(&n, hour) {
        return Ok(());
    }
    let (ok, _, err) = p::output(
        Command::new("notify-send").args(["--app-name=Command Center", "--", title, body]),
        5,
    )?;
    if ok {
        Ok(())
    } else {
        Err(err)
    }
}
pub fn status(app: &tauri::AppHandle, text: &str) {
    if let Some(tray) = app.tray_by_id("command-center") {
        let _ = tray.set_tooltip(Some(text));
    }
}
pub fn job_finished(app: &tauri::AppHandle, status_value: &str) {
    status(app, &format!("Command Center · Last task {status_value}"));
    if let Ok(c) = load_operations(app.clone()) {
        let n = c.notifications;
        if (status_value == "succeeded" && n.completions)
            || (status_value != "succeeded" && n.failures)
        {
            let _ = notify(
                app,
                "Command Center",
                &format!("Task {status_value}. Open Activity for details."),
            );
        }
    }
}
#[tauri::command]
pub async fn health_notification(app: tauri::AppHandle, summary: String) -> Result<(), String> {
    if summary.len() > 400 {
        return Err("Health summary too long".into());
    }
    {
        let state = app.state::<HealthNotice>();
        let mut previous = state.0.lock().map_err(|e| e.to_string())?;
        if *previous == summary {
            return Ok(());
        }
        *previous = summary.clone();
    }
    if summary.is_empty() || !load_operations(app.clone())?.notifications.health {
        return Ok(());
    }
    tauri::async_runtime::spawn_blocking(move || {
        notify(&app, "Workstation needs attention", &summary)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub fn desktop_status_info(app: tauri::AppHandle) -> serde_json::Value {
    serde_json::json!({"notifications":p::available("notify-send"),"tray":app.tray_by_id("command-center").is_some()})
}
pub fn setup(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let show = MenuItem::with_id(app, "show", "Open Command Center", true, None::<&str>)?;
    let hide = MenuItem::with_id(app, "hide", "Hide window", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &hide, &quit])?;
    let mut builder = TrayIconBuilder::with_id("command-center")
        .menu(&menu)
        .tooltip("Command Center · Ready")
        .on_menu_event(|app, event| {
            if let Some(window) = app.get_webview_window("main") {
                match event.id.as_ref() {
                    "show" => {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                    "hide" => {
                        let _ = window.hide();
                    }
                    "quit" => {
                        if !crate::jobs::prevent_close(app) {
                            app.exit(0);
                        } else {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    _ => {}
                }
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn quiet_hours_wrap_midnight() {
        let n = Notifications {
            quiet_start: 22,
            quiet_end: 7,
            ..Default::default()
        };
        assert!(quiet(&n, 23));
        assert!(quiet(&n, 6));
        assert!(!quiet(&n, 12));
        assert!(!quiet(&Notifications::default(), 0));
    }
}
