mod ai;
mod analysis;
#[cfg(test)] mod bench_test;
mod commands;
mod db;
pub mod git;
mod keychain;
mod models;
mod scanner;
mod util;

use std::sync::Mutex;

use commands::AppState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // Resolve the per-user app data directory and open (or create) the DB there.
            let dir = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app data dir");
            std::fs::create_dir_all(&dir).ok();
            let db_path = dir.join("code-crime-scene.db");

            let conn = rusqlite::Connection::open(&db_path).expect("failed to open database");
            db::init(&conn).expect("failed to initialize database schema");

            app.manage(AppState {
                conn: Mutex::new(conn),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::scan_and_analyze,
            commands::git_forensics,
            commands::save_report,
            commands::list_reports,
            commands::list_reports_for_project,
            commands::get_report,
            commands::delete_report,
            commands::list_projects,
            commands::touch_project,
            commands::get_setting,
            commands::set_setting,
            commands::write_text_file,
            commands::key_exists,
            commands::save_api_key,
            commands::delete_api_key,
            commands::verify_api_key,
            commands::analyze_with_ai,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
