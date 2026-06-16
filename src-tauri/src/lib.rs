mod commands;
mod core;
mod database;
use core::setup;
mod timer;
use database::Database;
use tauri::Manager;
use tauri_plugin_autostart::MacosLauncher;

pub fn run() {
    let mut builder = tauri::Builder::default();

    // 通用插件
    builder = builder
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--silent"]),
        ));

    // macOS 特有插件
    #[cfg(target_os = "macos")]
    {
        builder = builder.plugin(tauri_nspanel::init())
    }

    builder
        .setup(|app| {
            let app_handle = app.app_handle();

            // Initialize SQLite database
            let db = Database::new(&app_handle)
                .expect("Failed to initialize database");
            app_handle.manage(db);

            setup::default(&app_handle);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::show_main_window,
            commands::call_reminder,
            commands::setting,
            commands::hide_reminder_windows,
            commands::hide_reminder_window,
            commands::reset_timer,
            commands::pause_timer,
            commands::start_timer,
            commands::get_app_runtime_info,
            commands::get_installed_apps,
            commands::quit,
            // New database commands
            commands::add_record,
            commands::get_today_records,
            commands::get_date_records,
            commands::get_recent_stats,
            commands::get_today_total,
            commands::get_config_value,
            commands::set_config_value,
            commands::get_daily_goal,
            commands::set_weight,
            commands::set_manual_goal,
            commands::get_weight_info,
            commands::get_known_drinks,
            commands::add_known_drink,
            commands::update_known_drink,
            commands::delete_known_drink,
            commands::save_drink_icon,
            commands::get_drink_icon_abs_path,
            commands::get_schedule,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
