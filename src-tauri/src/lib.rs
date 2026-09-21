use tauri::Manager;
mod configuration;
mod diagnostics;
mod health;
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
mod workspace;

use repositories::{discover_repositories, open_repository};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    platform::initialize_path();
    tauri::Builder::default()
        .manage(jobs::Jobs::default())
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
            health::system_health,
            health::recovery_notes
        ])
        .run(tauri::generate_context!())
        .expect("error while running Command Center");
}
