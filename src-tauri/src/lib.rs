mod launcher;
mod repositories;
mod settings;

use repositories::{discover_repositories, open_repository};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![discover_repositories, open_repository, settings::load_settings, settings::save_settings])
        .run(tauri::generate_context!())
        .expect("error while running Command Center");
}
