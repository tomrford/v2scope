use refinery::embed_migrations;
use rusqlite::Connection;
use std::error::Error;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;

const DB_FILENAME: &str = "vscope.db";
const STARTUP_NOTICE_FILENAME: &str = "startup_notice.txt";

embed_migrations!();

pub fn run_migrations(app: &tauri::AppHandle) -> Result<(), Box<dyn Error>> {
    let db_path = resolve_db_path(app)?;
    if let Some(parent) = db_path.parent() {
        fs::create_dir_all(parent)?;
    }

    match run_migrations_once(&db_path) {
        Ok(()) => Ok(()),
        Err(first_error) => {
            reset_db_files(&db_path)?;
            run_migrations_once(&db_path)?;
            let _ = write_startup_notice(
                app,
                format!(
                    "Database was reset after startup load failure. Local snapshots were removed. ({first_error})"
                ),
            );
            Ok(())
        }
    }
}

fn resolve_db_path(app: &tauri::AppHandle) -> Result<PathBuf, Box<dyn Error>> {
    let app_dir = app.path().app_data_dir()?;
    Ok(app_dir.join(DB_FILENAME))
}

fn resolve_startup_notice_path(app: &tauri::AppHandle) -> Result<PathBuf, Box<dyn Error>> {
    let app_dir = app.path().app_data_dir()?;
    Ok(app_dir.join(STARTUP_NOTICE_FILENAME))
}

fn run_migrations_once(db_path: &Path) -> Result<(), Box<dyn Error>> {
    let mut conn = Connection::open(db_path)?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    migrations::runner().run(&mut conn)?;
    Ok(())
}

fn reset_db_files(db_path: &Path) -> Result<(), Box<dyn Error>> {
    let db_file = db_path.to_path_buf();
    let wal_file = PathBuf::from(format!("{}-wal", db_path.display()));
    let shm_file = PathBuf::from(format!("{}-shm", db_path.display()));
    for path in [db_file, wal_file, shm_file] {
        if path.exists() {
            fs::remove_file(path)?;
        }
    }
    Ok(())
}

fn write_startup_notice(app: &tauri::AppHandle, notice: String) -> Result<(), Box<dyn Error>> {
    let path = resolve_startup_notice_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, notice)?;
    Ok(())
}

#[tauri::command]
pub fn take_startup_notice(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let path = resolve_startup_notice_path(&app).map_err(|err| err.to_string())?;
    if !path.exists() {
        return Ok(None);
    }

    let content = fs::read_to_string(&path).map_err(|err| err.to_string())?;
    fs::remove_file(&path).map_err(|err| err.to_string())?;
    Ok(Some(content))
}
