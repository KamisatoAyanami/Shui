use rusqlite::Connection;
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct DrinkRecord {
    pub id: i64,
    pub drink_name: String,
    pub amount_ml: i64,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
pub struct DailyStat {
    pub date: String,
    pub total_ml: i64,
    pub count: i64,
}

/// Get current datetime string in "YYYY-MM-DD HH:MM:SS" format
fn now_datetime() -> String {
    chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

/// Get current date string in "YYYY-MM-DD" format
fn today_date() -> String {
    chrono::Local::now().format("%Y-%m-%d").to_string()
}

/// Insert a drink record. `at_time` is optional "HH:MM" format; if None, uses current time.
pub fn add_record(
    conn: &Connection,
    drink_name: &str,
    amount_ml: i64,
    at_time: Option<&str>,
) -> Result<(), String> {
    let created_at = match at_time {
        Some(time_str) => {
            let today = today_date();
            format!("{} {}", today, time_str)
        }
        None => now_datetime(),
    };

    conn.execute(
        "INSERT INTO records (drink_name, amount_ml, created_at) VALUES (?1, ?2, ?3)",
        rusqlite::params![drink_name, amount_ml, created_at],
    )
    .map_err(|e| format!("Failed to add record: {}", e))?;

    Ok(())
}

/// Insert a drink record with full datetime string "YYYY-MM-DD HH:MM:SS"
pub fn add_record_with_datetime(
    conn: &Connection,
    drink_name: &str,
    amount_ml: i64,
    datetime: &str,
) -> Result<(), String> {
    conn.execute(
        "INSERT INTO records (drink_name, amount_ml, created_at) VALUES (?1, ?2, ?3)",
        rusqlite::params![drink_name, amount_ml, datetime],
    )
    .map_err(|e| format!("Failed to add record: {}", e))?;

    Ok(())
}

/// Query today's records
pub fn get_today_records(conn: &Connection) -> Result<Vec<DrinkRecord>, String> {
    let today = today_date();
    get_date_records(conn, &today)
}

/// Query records for a specific date (date format: "YYYY-MM-DD")
pub fn get_date_records(conn: &Connection, date: &str) -> Result<Vec<DrinkRecord>, String> {
    let pattern = format!("{}%", date);
    let mut stmt = conn
        .prepare("SELECT id, drink_name, amount_ml, created_at FROM records WHERE created_at LIKE ?1 ORDER BY created_at ASC")
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let records = stmt
        .query_map(rusqlite::params![pattern], |row| {
            Ok(DrinkRecord {
                id: row.get(0)?,
                drink_name: row.get(1)?,
                amount_ml: row.get(2)?,
                created_at: row.get(3)?,
            })
        })
        .map_err(|e| format!("Failed to query records: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(records)
}

/// Get daily stats for the last N days
pub fn get_recent_stats(conn: &Connection, days: i64) -> Result<Vec<DailyStat>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT substr(created_at, 1, 10) as date,
                    SUM(amount_ml) as total_ml,
                    COUNT(*) as count
             FROM records
             WHERE created_at >= date('now', ?1)
             GROUP BY date
             ORDER BY date ASC",
        )
        .map_err(|e| format!("Failed to prepare stats query: {}", e))?;

    let offset = format!("-{} days", days);
    let stats = stmt
        .query_map(rusqlite::params![offset], |row| {
            Ok(DailyStat {
                date: row.get(0)?,
                total_ml: row.get(1)?,
                count: row.get(2)?,
            })
        })
        .map_err(|e| format!("Failed to query stats: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(stats)
}

/// Get today's total water intake in ml
pub fn get_today_total(conn: &Connection) -> Result<i64, String> {
    let today = today_date();
    let pattern = format!("{}%", today);

    let total: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(amount_ml), 0) FROM records WHERE created_at LIKE ?1",
            rusqlite::params![pattern],
            |row| row.get(0),
        )
        .map_err(|e| format!("Failed to get today total: {}", e))?;

    Ok(total)
}
