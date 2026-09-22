use tauri::Manager;
mod configuration;
mod operations;
mod desktop_status;
mod diagnostics;
mod health;
mod releases;
mod system_tools;
mod git_changes;
mod custom_actions;
mod integrations;
mod jobs;
mod launcher;
mod platform;
mod repositories;
mod settings;
mod terminal;
mod toolbox;
mod toolbox_updates;
mod workspace;

use repositories::{discover_repositories, open_repository};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    platform::initialize_path();
    tauri::Builder::default()
        .manage(jobs::Jobs::default())
        .manage(desktop_status::HealthNotice::default())
        .setup(|app| { if let Err(error)=desktop_status::setup(app.handle()) { eprintln!("Tray unavailable: {error}"); } Ok(()) })
        .manage(toolbox::Toolbox::default())
        .manage(terminal::Terminals::default())
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if jobs::prevent_close(window.app_handle()) {
                    api.prevent_close();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            operations::load_operations,
            operations::save_operations,
            operations::record_recovery_baseline,
            operations::recovery_baselines,
            operations::assess_profile,
            operations::change_timeline,
            desktop_status::health_notification,
            desktop_status::desktop_status_info,
            discover_repositories,
            open_repository,
            settings::load_settings,
            settings::save_settings,
            settings::export_settings,
            repositories::repository_details,
            git_changes::repository_diff,
            workspace::load_workspace,
            workspace::save_project,
            workspace::launch_project,
            integrations::detect_integrations,
            diagnostics::check_integrations,
            integrations::sync_status,
            toolbox::toolbox_catalog,
            toolbox_updates::toolbox_update_checks,
            toolbox_updates::toolbox_catalog_update,
            toolbox_updates::toolbox_compare,
            terminal::terminal_read,
            terminal::terminal_write,
            terminal::terminal_resize,
            terminal::terminal_export,
            jobs::job_history,
            jobs::job_result,
            jobs::stop_terminal_monitor,
            jobs::prepare_job,
            jobs::start_job,
            jobs::cancel_job,
            jobs::acknowledge_job,
            configuration::load_configuration,
            configuration::configuration_history,
            configuration::configuration_backup,
            configuration::validate_configuration,
            configuration::save_configuration,
            system_tools::system_units,
            system_tools::unit_details,
            system_tools::system_inventory,
            system_tools::export_inventory,
            system_tools::export_service_cleanup,
            releases::release_info,
            releases::check_release,
            releases::open_releases,
            releases::export_update_helper,
            health::system_health,
            health::recovery_notes
        ])
        .run(tauri::generate_context!())
        .expect("error while running Command Center");
}
