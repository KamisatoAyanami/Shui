use crate::core::window;
use crate::core::{store::settings::AppSettings, util};
use crate::timer;
use serde::Serialize;
use std::sync::atomic::Ordering;

// Remove this line since we don't need it
// use tauri::api::version::Version;
use tauri::{Emitter, Manager};
use timer::IS_RUNNING;
use tokio::time::{sleep, Duration};

use std::sync::Mutex;
use tokio::sync::mpsc;

// 只保留 channel 相关的静态变量
static REMINDER_PAGE_COUNTDOWN_SENDER: Mutex<Option<mpsc::Sender<()>>> = Mutex::new(None);

fn countdown_async(app_handle: tauri::AppHandle) {
    // 取消之前的倒计时
    if let Some(sender) = REMINDER_PAGE_COUNTDOWN_SENDER.lock().unwrap().take() {
        let _ = sender.try_send(());
    }

    // 创建新的 channel
    let (tx, mut rx) = mpsc::channel(1);
    *REMINDER_PAGE_COUNTDOWN_SENDER.lock().unwrap() = Some(tx);

    // 只在需要移动所有权到异步闭包时才 clone
    let app_handle = app_handle.clone();
    tauri::async_runtime::spawn(async move {
        let mut countdown = 30;
        let _ = app_handle.emit("countdown", countdown);

        loop {
            tokio::select! {
                _ = rx.recv() => {
                    break; // 收到取消信号
                }
                _ = sleep(Duration::from_secs(1)) => {
                    countdown -= 1;
                    let _ = app_handle.emit("countdown", countdown);
                    if countdown <= 0 {
                        break;
                    }
                }
            }
        }
    });
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
#[tauri::command]
pub fn call_reminder(app_handle: tauri::AppHandle) -> bool {
    println!("call_reminder");

    pause_timer();
    window::show_reminder_windows(&app_handle);

    countdown_async(app_handle);

    true
}

#[cfg(target_os = "windows")]
// windows的command居然要加async，笑死，浪费我2个晚上的时间
// https://github.com/tauri-apps/wry/issues/583
#[tauri::command]
pub async fn call_reminder(app_handle: tauri::AppHandle) -> bool {
    println!("call_reminder");

    pause_timer();
    // 直接传递引用，避免不必要的 clone
    window::show_reminder_windows(&app_handle);

    countdown_async(app_handle);

    true
}

#[tauri::command]
pub fn hide_reminder_windows(app_handle: tauri::AppHandle) {
    window::hide_reminder_windows(&app_handle);

    // 取消之前的倒计时
    if let Some(sender) = REMINDER_PAGE_COUNTDOWN_SENDER.lock().unwrap().take() {
        let _ = sender.try_send(());
    }
}

#[tauri::command]
pub fn hide_reminder_window(app_handle: tauri::AppHandle, label: &str) {
    window::hide_reminder_window(&app_handle, &label);
}

#[tauri::command]
pub fn reset_timer() {
    // 重置计时器
    IS_RUNNING.store(false, Ordering::SeqCst);

    tauri::async_runtime::spawn(async move {
        sleep(Duration::from_millis(1000)).await;
        IS_RUNNING.store(true, Ordering::SeqCst);
    });
}

#[tauri::command]
pub fn pause_timer() {
    IS_RUNNING.store(false, Ordering::SeqCst);
}

#[tauri::command]
pub fn start_timer() {
    IS_RUNNING.store(true, Ordering::SeqCst);
}

#[tauri::command]
pub fn show_main_window(app_handle: tauri::AppHandle) {
    if let Some(window) = app_handle.get_webview_window("main") {
        #[cfg(target_os = "macos")]
        {
            // macOS: Accessory 模式下需要先激活 app 再显示窗口
            let _ = window.unminimize();
            let _ = window.show();
            let _ = window.set_focus();
        }
        #[cfg(not(target_os = "macos"))]
        {
            let _ = window.unminimize();
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}

#[tauri::command]
pub async fn quit(app_handle: tauri::AppHandle) {
    app_handle.exit(0);
}

#[derive(Serialize)]
pub struct SettingResponse {
    screen: i32,
}

#[tauri::command]
pub fn setting(app_handle: tauri::AppHandle) -> SettingResponse {
    let main_window = app_handle.get_webview_window("main").unwrap();
    let main_window_size = main_window.inner_size().unwrap();
    println!("main_window_size: {:?}", main_window_size);

    SettingResponse { screen: 2 }
}

#[derive(Serialize, Debug)]
pub struct AppRuntimeInfoResponse {
    is_running: bool,
    app_settings: AppSettings,
    version: String,
    os_version: String,
    os_arch: String,
    chip_info: String,
}

#[tauri::command(async)]
pub async fn get_app_runtime_info(
    app_handle: tauri::AppHandle,
) -> Result<AppRuntimeInfoResponse, String> {
    let app_settings = AppSettings::load_from_store::<tauri::Wry>(&app_handle);
    let is_running = IS_RUNNING.load(Ordering::SeqCst);
    let version = app_handle.package_info().version.to_string();

    // 获取操作系统信息
    let os_info = format!("{} {}", std::env::consts::OS, std::env::consts::ARCH);
    let os_arch = std::env::consts::ARCH.to_string();

    // 获取芯片信息
    let chip_info = {
        #[cfg(target_os = "macos")]
        {
            let output = std::process::Command::new("sysctl")
                .args(["-n", "machdep.cpu.brand_string"])
                .output()
                .map_err(|e| e.to_string())?;
            String::from_utf8_lossy(&output.stdout).trim().to_string()
        }
        #[cfg(not(target_os = "macos"))]
        {
            "Unknown".to_string()
        }
    };

    Ok(AppRuntimeInfoResponse {
        app_settings,
        is_running,
        version,
        os_version: os_info,
        os_arch,
        chip_info,
    })
}

#[tauri::command]
pub async fn get_installed_apps() -> Vec<String> {
    util::get_installed_apps().await
}

// ============================================================
// Database commands — records
// ============================================================

use crate::database;
use crate::database::Database;

#[tauri::command]
pub fn add_record(
    app_handle: tauri::AppHandle,
    drink_name: String,
    amount_ml: i64,
    at_time: Option<String>,
) -> Result<(), String> {
    let db = app_handle.state::<Database>();
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    database::records::add_record(&conn, &drink_name, amount_ml, at_time.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_today_records(
    app_handle: tauri::AppHandle,
) -> Result<Vec<database::records::DrinkRecord>, String> {
    let db = app_handle.state::<Database>();
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    database::records::get_today_records(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_date_records(
    app_handle: tauri::AppHandle,
    date: String,
) -> Result<Vec<database::records::DrinkRecord>, String> {
    let db = app_handle.state::<Database>();
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    database::records::get_date_records(&conn, &date).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_recent_stats(
    app_handle: tauri::AppHandle,
    days: i64,
) -> Result<Vec<database::records::DailyStat>, String> {
    let db = app_handle.state::<Database>();
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    database::records::get_recent_stats(&conn, days).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_today_total(app_handle: tauri::AppHandle) -> Result<i64, String> {
    let db = app_handle.state::<Database>();
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    database::records::get_today_total(&conn).map_err(|e| e.to_string())
}

// ============================================================
// Database commands — config
// ============================================================

#[tauri::command]
pub fn get_config_value(
    app_handle: tauri::AppHandle,
    key: String,
) -> Result<Option<String>, String> {
    let db = app_handle.state::<Database>();
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    Ok(database::config::get_config(&conn, &key))
}

#[tauri::command]
pub fn set_config_value(
    app_handle: tauri::AppHandle,
    key: String,
    value: String,
) -> Result<(), String> {
    let db = app_handle.state::<Database>();
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    database::config::set_config(&conn, &key, &value).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_daily_goal(app_handle: tauri::AppHandle) -> Result<i64, String> {
    let db = app_handle.state::<Database>();
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let val = database::config::get_config(&conn, "daily_goal");
    Ok(val.and_then(|v| v.parse().ok()).unwrap_or(2000))
}

#[tauri::command]
pub fn set_weight(app_handle: tauri::AppHandle, weight_kg: f64) -> Result<i64, String> {
    let db = app_handle.state::<Database>();
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let multiplier: i64 = database::config::get_config(&conn, "multiplier")
        .and_then(|v| v.parse().ok())
        .unwrap_or(33);
    let daily_goal = (weight_kg * multiplier as f64).round() as i64;
    database::config::set_config(&conn, "weight", &weight_kg.to_string())
        .map_err(|e| e.to_string())?;
    database::config::set_config(&conn, "daily_goal", &daily_goal.to_string())
        .map_err(|e| e.to_string())?;
    database::config::set_config(&conn, "goal_source", "auto").map_err(|e| e.to_string())?;
    Ok(daily_goal)
}

#[tauri::command]
pub fn set_manual_goal(app_handle: tauri::AppHandle, goal_ml: i64) -> Result<(), String> {
    let db = app_handle.state::<Database>();
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    database::config::set_config(&conn, "daily_goal", &goal_ml.to_string())
        .map_err(|e| e.to_string())?;
    database::config::set_config(&conn, "goal_source", "manual").map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Serialize)]
pub struct WeightInfo {
    pub weight: Option<f64>,
    pub multiplier: i64,
    pub goal_ml: i64,
    pub source: String,
}

#[tauri::command]
pub fn get_weight_info(app_handle: tauri::AppHandle) -> Result<WeightInfo, String> {
    let db = app_handle.state::<Database>();
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let weight = database::config::get_config(&conn, "weight")
        .and_then(|v| v.parse::<f64>().ok());
    let multiplier = database::config::get_config(&conn, "multiplier")
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(33);
    let goal = database::config::get_config(&conn, "daily_goal")
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(2000);
    let source = database::config::get_config(&conn, "goal_source")
        .unwrap_or_else(|| "default".to_string());

    Ok(WeightInfo {
        weight,
        multiplier,
        goal_ml: goal,
        source,
    })
}

// ============================================================
// Database commands — drinks
// ============================================================

#[tauri::command]
pub fn get_known_drinks(
    app_handle: tauri::AppHandle,
) -> Result<Vec<database::drinks::KnownDrink>, String> {
    let db = app_handle.state::<Database>();
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    database::drinks::get_all_drinks(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_known_drink(
    app_handle: tauri::AppHandle,
    name: String,
    amount_ml: i64,
) -> Result<i64, String> {
    let db = app_handle.state::<Database>();
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    database::drinks::add_drink(&conn, &name, amount_ml).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_known_drink(
    app_handle: tauri::AppHandle,
    id: i64,
    name: String,
    amount_ml: i64,
) -> Result<(), String> {
    let db = app_handle.state::<Database>();
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    database::drinks::update_drink(&conn, id, &name, amount_ml).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_known_drink(app_handle: tauri::AppHandle, id: i64) -> Result<(), String> {
    let db = app_handle.state::<Database>();
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let icon_path = database::drinks::delete_drink(&conn, id).map_err(|e| e.to_string())?;
    // Clean up icon file if exists
    if let Some(path) = icon_path {
        if let Ok(app_dir) = app_handle.path().app_data_dir() {
            let icon_file = app_dir.join("drink_icons").join(&path);
            let _ = std::fs::remove_file(icon_file);
        }
    }
    Ok(())
}

// ============================================================
// Database commands — image
// ============================================================

#[tauri::command]
pub fn save_drink_icon(
    app_handle: tauri::AppHandle,
    drink_id: i64,
    source_path: String,
) -> Result<String, String> {
    let app_dir = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    let icons_dir = app_dir.join("drink_icons");
    std::fs::create_dir_all(&icons_dir).map_err(|e| e.to_string())?;

    let source = std::path::Path::new(&source_path);
    let ext = source
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png");
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let filename = format!("{}_{}.{}", drink_id, timestamp, ext);
    let dest = icons_dir.join(&filename);

    std::fs::copy(&source_path, &dest).map_err(|e| format!("复制图片失败: {}", e))?;

    let db = app_handle.state::<Database>();
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    database::drinks::update_icon_path(&conn, drink_id, &filename).map_err(|e| e.to_string())?;

    Ok(filename)
}

#[tauri::command]
pub fn get_drink_icon_abs_path(
    app_handle: tauri::AppHandle,
    filename: String,
) -> Result<String, String> {
    let app_dir = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    let icon_path = app_dir.join("drink_icons").join(&filename);
    Ok(icon_path.to_string_lossy().to_string())
}

// ============================================================
// Database commands — schedule
// ============================================================

#[tauri::command]
pub fn get_schedule(
    app_handle: tauri::AppHandle,
) -> Result<Vec<database::schedule::ScheduleItem>, String> {
    let db = app_handle.state::<Database>();
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let goal = database::config::get_config(&conn, "daily_goal")
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(2000);
    Ok(database::schedule::calculate_schedule(goal))
}
