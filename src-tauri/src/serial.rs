use crate::error::SerialError;
use serde::{Deserialize, Serialize};
use serialport::{
    ClearBuffer, DataBits, FlowControl, Parity, SerialPort, SerialPortType, StopBits,
};
use std::collections::HashMap;
use std::io::Write;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock, RwLock};
use std::time::{Duration, Instant};

// Protocol constants matching the code in onboard/vscope.c
const VSCOPE_SYNC_BYTE: u8 = 0xC8;
const MAX_FRAME_LEN: usize = 254;
const MAX_PAYLOAD_LEN: usize = 252;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SerialConfig {
    pub baud_rate: u32,
    pub data_bits: DataBits,
    pub parity: Parity,
    pub stop_bits: StopBits,
    pub read_timeout_ms: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PortInfo {
    pub path: String,
    pub vid: Option<u16>,
    pub pid: Option<u16>,
    pub manufacturer: Option<String>,
    pub product: Option<String>,
    pub serial_number: Option<String>,
    pub port_type: String,
}

type PortHandle = Arc<Mutex<Box<dyn SerialPort + Send>>>;

struct Registry {
    next_id: AtomicU64,
    ports: RwLock<HashMap<u64, PortHandle>>,
}

fn poisoned_registry_lock(context: &str) -> SerialError {
    SerialError::IoError {
        message: format!("registry lock poisoned during {context}"),
    }
}

fn poisoned_device_lock(handle_id: u64, context: &str) -> SerialError {
    SerialError::IoError {
        message: format!(
            "device lock poisoned during {context}; handle {handle_id} removed; reconnect required"
        ),
    }
}

impl Registry {
    fn new() -> Self {
        Self {
            next_id: AtomicU64::new(1),
            ports: RwLock::new(HashMap::new()),
        }
    }

    fn insert(&self, port: Box<dyn SerialPort + Send>) -> Result<u64, SerialError> {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let mut ports = self
            .ports
            .write()
            .map_err(|_| poisoned_registry_lock("insert"))?;
        ports.insert(id, Arc::new(Mutex::new(port)));
        Ok(id)
    }

    fn get(&self, id: u64) -> Result<Option<PortHandle>, SerialError> {
        let ports = self
            .ports
            .read()
            .map_err(|_| poisoned_registry_lock("get"))?;
        Ok(ports.get(&id).cloned())
    }

    fn remove(&self, id: u64) -> Result<Option<PortHandle>, SerialError> {
        let mut ports = self
            .ports
            .write()
            .map_err(|_| poisoned_registry_lock("remove"))?;
        Ok(ports.remove(&id))
    }
}

fn registry() -> &'static Registry {
    static REGISTRY: OnceLock<Registry> = OnceLock::new();
    REGISTRY.get_or_init(Registry::new)
}

#[tauri::command]
pub fn list_ports() -> Result<Vec<PortInfo>, SerialError> {
    let ports = serialport::available_ports()?;
    let mut out = Vec::new();
    for port in ports {
        let (vid, pid, manufacturer, product, serial_number, port_type) = match &port.port_type {
            SerialPortType::UsbPort(info) => (
                Some(info.vid),
                Some(info.pid),
                info.manufacturer.clone(),
                info.product.clone(),
                info.serial_number.clone(),
                "usb".to_string(),
            ),
            SerialPortType::BluetoothPort => {
                (None, None, None, None, None, "bluetooth".to_string())
            }
            SerialPortType::PciPort => (None, None, None, None, None, "pci".to_string()),
            SerialPortType::Unknown => (None, None, None, None, None, "unknown".to_string()),
        };

        out.push(PortInfo {
            path: port.port_name,
            vid,
            pid,
            manufacturer,
            product,
            serial_number,
            port_type,
        });
    }

    Ok(out)
}

#[tauri::command]
pub fn open_device(path: String, config: SerialConfig) -> Result<u64, SerialError> {
    let builder = serialport::new(&path, config.baud_rate)
        .data_bits(config.data_bits)
        .parity(config.parity)
        .stop_bits(config.stop_bits)
        .flow_control(FlowControl::None)
        .timeout(Duration::from_millis(config.read_timeout_ms));

    let port = builder.open().map_err(|err| match err.kind {
        serialport::ErrorKind::NoDevice => SerialError::PortNotFound { path: path.clone() },
        serialport::ErrorKind::Io(std::io::ErrorKind::PermissionDenied) => {
            SerialError::PortBusy { path: path.clone() }
        }
        _ => SerialError::from(err),
    })?;
    registry().insert(port)
}

#[tauri::command]
pub fn close_device(handle_id: u64) -> Result<(), SerialError> {
    let _ = registry().remove(handle_id)?;
    Ok(())
}

#[tauri::command]
pub fn flush_device(handle_id: u64) -> Result<(), SerialError> {
    let port = registry()
        .get(handle_id)?
        .ok_or(SerialError::InvalidHandle { handle_id })?;
    let port = port.lock().map_err(|_| {
        let _ = registry().remove(handle_id);
        poisoned_device_lock(handle_id, "flush_device")
    })?;
    port.clear(ClearBuffer::All)?;
    Ok(())
}

#[tauri::command]
pub fn send_request(handle_id: u64, payload: Vec<u8>) -> Result<Vec<u8>, SerialError> {
    if payload.is_empty() {
        return Err(SerialError::InvalidConfig {
            message: "payload must include message type".to_string(),
        });
    }

    let port = registry()
        .get(handle_id)?
        .ok_or(SerialError::InvalidHandle { handle_id })?;
    let mut port = port.lock().map_err(|_| {
        let _ = registry().remove(handle_id);
        poisoned_device_lock(handle_id, "send_request")
    })?;

    // Clear any stale data from previous failed reads before sending
    let _ = port.clear(ClearBuffer::Input);

    let frame = build_frame(&payload)?;
    port.write_all(&frame)?;
    port.flush()?;

    read_frame(&mut **port)
}

fn build_frame(payload: &[u8]) -> Result<Vec<u8>, SerialError> {
    let payload_len = payload.len();
    if payload_len > (1 + MAX_PAYLOAD_LEN) {
        return Err(SerialError::PayloadTooLarge);
    }

    let len_field = (payload_len + 1) as u8;
    let mut frame = Vec::with_capacity(1 + 1 + payload_len + 1);
    frame.push(VSCOPE_SYNC_BYTE);
    frame.push(len_field);
    frame.extend_from_slice(payload);
    let crc = crc8(payload);
    frame.push(crc);
    Ok(frame)
}

fn read_frame(port: &mut dyn SerialPort) -> Result<Vec<u8>, SerialError> {
    let deadline = Instant::now() + port.timeout();

    loop {
        if Instant::now() >= deadline {
            return Err(SerialError::Timeout);
        }

        let mut sync = [0u8; 1];
        port.read_exact(&mut sync)?;
        if sync[0] != VSCOPE_SYNC_BYTE {
            continue;
        }

        let mut len_byte = [0u8; 1];
        port.read_exact(&mut len_byte)?;
        let len = len_byte[0] as usize;
        if !(2..=MAX_FRAME_LEN).contains(&len) {
            continue;
        }

        let mut buf = vec![0u8; len];
        port.read_exact(&mut buf)?;

        let payload_end = len - 1;
        let crc = buf[payload_end];
        let calc = crc8(&buf[..payload_end]);
        if crc != calc {
            return Err(SerialError::CrcMismatch);
        }

        return Ok(buf[..payload_end].to_vec());
    }
}

const CRC8_LUT: [u8; 256] = [
    0x00, 0xD5, 0x7F, 0xAA, 0xFE, 0x2B, 0x81, 0x54, 0x29, 0xFC, 0x56, 0x83, 0xD7, 0x02, 0xA8, 0x7D,
    0x52, 0x87, 0x2D, 0xF8, 0xAC, 0x79, 0xD3, 0x06, 0x7B, 0xAE, 0x04, 0xD1, 0x85, 0x50, 0xFA, 0x2F,
    0xA4, 0x71, 0xDB, 0x0E, 0x5A, 0x8F, 0x25, 0xF0, 0x8D, 0x58, 0xF2, 0x27, 0x73, 0xA6, 0x0C, 0xD9,
    0xF6, 0x23, 0x89, 0x5C, 0x08, 0xDD, 0x77, 0xA2, 0xDF, 0x0A, 0xA0, 0x75, 0x21, 0xF4, 0x5E, 0x8B,
    0x9D, 0x48, 0xE2, 0x37, 0x63, 0xB6, 0x1C, 0xC9, 0xB4, 0x61, 0xCB, 0x1E, 0x4A, 0x9F, 0x35, 0xE0,
    0xCF, 0x1A, 0xB0, 0x65, 0x31, 0xE4, 0x4E, 0x9B, 0xE6, 0x33, 0x99, 0x4C, 0x18, 0xCD, 0x67, 0xB2,
    0x39, 0xEC, 0x46, 0x93, 0xC7, 0x12, 0xB8, 0x6D, 0x10, 0xC5, 0x6F, 0xBA, 0xEE, 0x3B, 0x91, 0x44,
    0x6B, 0xBE, 0x14, 0xC1, 0x95, 0x40, 0xEA, 0x3F, 0x42, 0x97, 0x3D, 0xE8, 0xBC, 0x69, 0xC3, 0x16,
    0xEF, 0x3A, 0x90, 0x45, 0x11, 0xC4, 0x6E, 0xBB, 0xC6, 0x13, 0xB9, 0x6C, 0x38, 0xED, 0x47, 0x92,
    0xBD, 0x68, 0xC2, 0x17, 0x43, 0x96, 0x3C, 0xE9, 0x94, 0x41, 0xEB, 0x3E, 0x6A, 0xBF, 0x15, 0xC0,
    0x4B, 0x9E, 0x34, 0xE1, 0xB5, 0x60, 0xCA, 0x1F, 0x62, 0xB7, 0x1D, 0xC8, 0x9C, 0x49, 0xE3, 0x36,
    0x19, 0xCC, 0x66, 0xB3, 0xE7, 0x32, 0x98, 0x4D, 0x30, 0xE5, 0x4F, 0x9A, 0xCE, 0x1B, 0xB1, 0x64,
    0x72, 0xA7, 0x0D, 0xD8, 0x8C, 0x59, 0xF3, 0x26, 0x5B, 0x8E, 0x24, 0xF1, 0xA5, 0x70, 0xDA, 0x0F,
    0x20, 0xF5, 0x5F, 0x8A, 0xDE, 0x0B, 0xA1, 0x74, 0x09, 0xDC, 0x76, 0xA3, 0xF7, 0x22, 0x88, 0x5D,
    0xD6, 0x03, 0xA9, 0x7C, 0x28, 0xFD, 0x57, 0x82, 0xFF, 0x2A, 0x80, 0x55, 0x01, 0xD4, 0x7E, 0xAB,
    0x84, 0x51, 0xFB, 0x2E, 0x7A, 0xAF, 0x05, 0xD0, 0xAD, 0x78, 0xD2, 0x07, 0x53, 0x86, 0x2C, 0xF9,
];

fn crc8(data: &[u8]) -> u8 {
    let mut crc = 0u8;
    for &byte in data {
        crc = CRC8_LUT[(crc ^ byte) as usize];
    }
    crc
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn crc8_empty() {
        assert_eq!(crc8(&[]), 0x00);
    }

    #[test]
    fn crc8_single_byte() {
        assert_eq!(crc8(&[0x00]), 0x00);
        assert_eq!(crc8(&[0x01]), 0xD5);
        assert_eq!(crc8(&[0xFF]), 0xF9);
    }

    #[test]
    fn crc8_multi_byte() {
        // Verify deterministic output for multi-byte input
        assert_eq!(crc8(&[0x01, 0x02, 0x03]), 0x3F);
        // Different input produces different CRC
        assert_ne!(crc8(&[0x01, 0x02, 0x03]), crc8(&[0x03, 0x02, 0x01]));
    }

    #[test]
    fn build_frame_structure() {
        let payload = vec![0x01, 0x02, 0x03];
        let frame = build_frame(&payload).unwrap();

        assert_eq!(frame[0], VSCOPE_SYNC_BYTE);
        // len field = payload_len + 1 (for crc) = 4
        assert_eq!(frame[1], 0x04);
        // payload
        assert_eq!(&frame[2..5], &payload);
        // crc
        assert_eq!(frame[5], crc8(&payload));
    }

    #[test]
    fn build_frame_min_payload() {
        let payload = vec![0x42]; // single byte (message type)
        let frame = build_frame(&payload).unwrap();

        assert_eq!(frame.len(), 1 + 1 + 1 + 1); // sync + len(1) + payload + crc
        assert_eq!(frame[0], VSCOPE_SYNC_BYTE);
        assert_eq!(frame[1], 2); // payload + crc
    }

    #[test]
    fn build_frame_larger_payload() {
        let payload = vec![0xAA; 253];
        let frame = build_frame(&payload).unwrap();

        assert_eq!(frame.len(), 1 + 1 + 253 + 1);
        let len_field = frame[1];
        assert_eq!(len_field, 254); // 253 + 1 for crc
    }

    #[test]
    fn build_frame_too_large() {
        let payload = vec![0xAA; 254];
        assert!(build_frame(&payload).is_err());
    }

    #[test]
    fn registry_id_generation() {
        let reg = Registry::new();

        // Can't easily test with real SerialPort, but we can test the ID generation
        let id1 = reg.next_id.fetch_add(1, Ordering::Relaxed);
        let id2 = reg.next_id.fetch_add(1, Ordering::Relaxed);
        assert_eq!(id1, 1);
        assert_eq!(id2, 2);
    }
}
