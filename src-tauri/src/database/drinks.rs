use rusqlite::Connection;
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct KnownDrink {
    pub id: i64,
    pub name: String,
    pub amount_ml: i64,
    pub icon_path: Option<String>,
    pub sort_order: i64,
}

/// Get all drinks ordered by sort_order
pub fn get_all_drinks(conn: &Connection) -> Result<Vec<KnownDrink>, String> {
    let mut stmt = conn
        .prepare("SELECT id, name, amount_ml, icon_path, sort_order FROM known_drinks ORDER BY sort_order ASC")
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let drinks = stmt
        .query_map([], |row| {
            Ok(KnownDrink {
                id: row.get(0)?,
                name: row.get(1)?,
                amount_ml: row.get(2)?,
                icon_path: row.get(3)?,
                sort_order: row.get(4)?,
            })
        })
        .map_err(|e| format!("Failed to query drinks: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(drinks)
}

/// Add a new drink. Returns the new drink's ID.
pub fn add_drink(conn: &Connection, name: &str, amount_ml: i64) -> Result<i64, String> {
    // Auto-assign sort_order: max(sort_order) + 1
    let max_order: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(sort_order), 0) FROM known_drinks",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    conn.execute(
        "INSERT INTO known_drinks (name, amount_ml, sort_order) VALUES (?1, ?2, ?3)",
        rusqlite::params![name, amount_ml, max_order + 1],
    )
    .map_err(|e| format!("Failed to add drink: {}", e))?;

    Ok(conn.last_insert_rowid())
}

/// Update a drink's name and amount
pub fn update_drink(conn: &Connection, id: i64, name: &str, amount_ml: i64) -> Result<(), String> {
    let affected = conn
        .execute(
            "UPDATE known_drinks SET name = ?1, amount_ml = ?2 WHERE id = ?3",
            rusqlite::params![name, amount_ml, id],
        )
        .map_err(|e| format!("Failed to update drink: {}", e))?;

    if affected == 0 {
        return Err(format!("Drink with id {} not found", id));
    }
    Ok(())
}

/// Delete a drink. Returns the icon_path if one existed (for file cleanup).
pub fn delete_drink(conn: &Connection, id: i64) -> Result<Option<String>, String> {
    // First get the icon_path for cleanup
    let icon_path: Option<String> = conn
        .query_row(
            "SELECT icon_path FROM known_drinks WHERE id = ?1",
            rusqlite::params![id],
            |row| row.get(0),
        )
        .ok();

    let affected = conn
        .execute("DELETE FROM known_drinks WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| format!("Failed to delete drink: {}", e))?;

    if affected == 0 {
        return Err(format!("Drink with id {} not found", id));
    }

    Ok(icon_path)
}

/// Update a drink's icon path
pub fn update_icon_path(
    conn: &Connection,
    id: i64,
    icon_path: &str,
) -> Result<(), String> {
    conn.execute(
        "UPDATE known_drinks SET icon_path = ?1 WHERE id = ?2",
        rusqlite::params![icon_path, id],
    )
    .map_err(|e| format!("Failed to update icon path: {}", e))?;

    Ok(())
}
