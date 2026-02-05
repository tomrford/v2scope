#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            db::run_migrations(app.handle())?;
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            crate::db::take_startup_notice,
            crate::serial::list_ports,
            crate::serial::open_device,
            crate::serial::close_device,
            crate::serial::flush_device,
            crate::serial::send_request,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

mod db;
mod error;
mod serial;
