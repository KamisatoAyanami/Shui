pub mod config;
pub mod drinks;
pub mod records;
pub mod schedule;

use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::Manager;

pub struct Database {
    pub conn: Mutex<Connection>,
}

impl Database {
    pub fn new(app_handle: &tauri::AppHandle) -> Result<Self, Box<dyn std::error::Error>> {
        let app_dir = app_handle
            .path()
            .app_data_dir()
            .map_err(|e| format!("Failed to get app data dir: {}", e))?;

        std::fs::create_dir_all(&app_dir)
            .map_err(|e| format!("Failed to create app data dir: {}", e))?;

        let db_path: PathBuf = app_dir.join("records.db");
        println!("Database path: {:?}", db_path);

        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;

        // Enable WAL mode for better concurrent access
        conn.execute_batch("PRAGMA journal_mode=WAL;")
            .map_err(|e| format!("Failed to set WAL mode: {}", e))?;

        // Create tables
        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS records (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                drink_name  TEXT NOT NULL,
                amount_ml   INTEGER NOT NULL,
                created_at  TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS config (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS known_drinks (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                name        TEXT NOT NULL UNIQUE,
                amount_ml   INTEGER NOT NULL,
                icon_path   TEXT,
                sort_order  INTEGER DEFAULT 0
            );
            ",
        )
        .map_err(|e| format!("Failed to create tables: {}", e))?;

        // Insert default drinks if table is empty
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM known_drinks", [], |row| row.get(0))
            .unwrap_or(0);

        if count == 0 {
            conn.execute_batch(
                "
                INSERT INTO known_drinks (name, amount_ml, sort_order) VALUES
                    ('一杯水',   250, 1),
                    ('半杯水',   125, 2),
                    ('一壶茶',   500, 3),
                    ('东方树叶', 500, 4),
                    ('矿泉水',   550, 5),
                    ('可乐',     330, 6),
                    ('咖啡',     300, 7);
                ",
            )
            .map_err(|e| format!("Failed to insert default drinks: {}", e))?;
            println!("Inserted 7 default drinks");
        }

        // Create drink_icons directory
        let icons_dir = app_dir.join("drink_icons");
        std::fs::create_dir_all(&icons_dir).ok();

        println!("Database initialized successfully");
        Ok(Database {
            conn: Mutex::new(conn),
        })
    }
}
