#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            crate::serial::list_ports,
            crate::serial::open_device,
            crate::serial::close_device,
            crate::serial::flush_device,
            crate::serial::send_request,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

mod error;
mod serial;
