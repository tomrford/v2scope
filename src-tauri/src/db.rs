use refinery::embed_migrations;
use rusqlite::Connection;
use std::error::Error;
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

const DB_FILENAME: &str = "vscope.db";

embed_migrations!();

pub fn run_migrations(app: &tauri::AppHandle) -> Result<(), Box<dyn Error>> {
    let db_path = resolve_db_path(app)?;
    if let Some(parent) = db_path.parent() {
        fs::create_dir_all(parent)?;
    }

    let mut conn = Connection::open(db_path)?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;

    migrations::runner().run(&mut conn)?;
    Ok(())
}

fn resolve_db_path(app: &tauri::AppHandle) -> Result<PathBuf, Box<dyn Error>> {
    let app_dir = app.path().app_data_dir()?;
    Ok(app_dir.join(DB_FILENAME))
}
