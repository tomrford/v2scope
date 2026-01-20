use serde::{Deserialize, Serialize};
use serialport::{
    ClearBuffer, DataBits, FlowControl, Parity, SerialPort, SerialPortType, StopBits,
};
use std::collections::HashMap;
use std::io::{self, Write};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock, RwLock};
use std::time::{Duration, Instant};

const VSCOPE_SYNC_BYTE: u8 = 0xC8;
const MAX_FRAME_LEN: usize = 254;
const MAX_PAYLOAD_LEN: usize = 252;
const FRAME_READ_TIMEOUT_MS: u64 = 100;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SerialConfig {
    pub baud_rate: u32,
    pub data_bits: String,
    pub parity: String,
    pub stop_bits: String,
    pub read_timeout_ms: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PortFilter {
    pub vid: Option<u16>,
    pub pid: Option<u16>,
    pub name_substr: Option<String>,
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

impl Registry {
    fn new() -> Self {
        Self {
            next_id: AtomicU64::new(1),
            ports: RwLock::new(HashMap::new()),
        }
    }

    fn insert(&self, port: Box<dyn SerialPort + Send>) -> u64 {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let mut ports = self.ports.write().expect("lock ports");
        ports.insert(id, Arc::new(Mutex::new(port)));
        id
    }

    fn get(&self, id: u64) -> Option<PortHandle> {
        let ports = self.ports.read().expect("lock ports");
        ports.get(&id).cloned()
    }

    fn remove(&self, id: u64) -> Option<PortHandle> {
        let mut ports = self.ports.write().expect("lock ports");
        ports.remove(&id)
    }
}

fn registry() -> &'static Registry {
    static REGISTRY: OnceLock<Registry> = OnceLock::new();
    REGISTRY.get_or_init(Registry::new)
}

#[tauri::command]
pub fn list_ports(filters: Option<PortFilter>) -> Result<Vec<PortInfo>, String> {
    let ports = serialport::available_ports().map_err(|err| err.to_string())?;
    let name_filter = filters
        .as_ref()
        .and_then(|filter| filter.name_substr.as_ref())
        .map(|value| value.to_lowercase());
    let vid_filter = filters.as_ref().and_then(|filter| filter.vid);
    let pid_filter = filters.as_ref().and_then(|filter| filter.pid);

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

        if let Some(vid_filter) = vid_filter {
            if vid != Some(vid_filter) {
                continue;
            }
        }
        if let Some(pid_filter) = pid_filter {
            if pid != Some(pid_filter) {
                continue;
            }
        }
        if let Some(name_filter) = name_filter.as_ref() {
            let mut haystack = port.port_name.to_lowercase();
            if let Some(value) = manufacturer.as_ref() {
                haystack.push_str(&value.to_lowercase());
            }
            if let Some(value) = product.as_ref() {
                haystack.push_str(&value.to_lowercase());
            }
            if let Some(value) = serial_number.as_ref() {
                haystack.push_str(&value.to_lowercase());
            }
            if !haystack.contains(name_filter) {
                continue;
            }
        }

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
pub fn open_device(path: String, config: SerialConfig) -> Result<u64, String> {
    let builder = serialport::new(&path, config.baud_rate)
        .data_bits(parse_data_bits(&config.data_bits)?)
        .parity(parse_parity(&config.parity)?)
        .stop_bits(parse_stop_bits(&config.stop_bits)?)
        .flow_control(FlowControl::None)
        .timeout(Duration::from_millis(config.read_timeout_ms));

    let port = builder.open().map_err(|err| err.to_string())?;
    Ok(registry().insert(port))
}

#[tauri::command]
pub fn close_device(handle_id: u64) -> Result<(), String> {
    let _ = registry().remove(handle_id);
    Ok(())
}

#[tauri::command]
pub fn flush_device(handle_id: u64) -> Result<(), String> {
    let port = registry()
        .get(handle_id)
        .ok_or_else(|| "unknown device handle".to_string())?;
    let port = port
        .lock()
        .map_err(|_| "device lock poisoned".to_string())?;
    port.clear(ClearBuffer::All).map_err(|err| err.to_string())
}

#[tauri::command]
pub fn send_request(handle_id: u64, payload: Vec<u8>) -> Result<Vec<u8>, String> {
    if payload.is_empty() {
        return Err("payload must include message type".to_string());
    }

    let port = registry()
        .get(handle_id)
        .ok_or_else(|| "unknown device handle".to_string())?;
    let mut port = port
        .lock()
        .map_err(|_| "device lock poisoned".to_string())?;

    let frame = build_frame(&payload)?;
    port.write_all(&frame).map_err(|err| err.to_string())?;
    port.flush().map_err(|err| err.to_string())?;

    read_frame(&mut **port).map_err(|err| err.to_string())
}

fn parse_data_bits(value: &str) -> Result<DataBits, String> {
    match value.to_lowercase().as_str() {
        "5" | "five" => Ok(DataBits::Five),
        "6" | "six" => Ok(DataBits::Six),
        "7" | "seven" => Ok(DataBits::Seven),
        "8" | "eight" => Ok(DataBits::Eight),
        _ => Err(format!("unsupported data_bits: {value}")),
    }
}

fn parse_parity(value: &str) -> Result<Parity, String> {
    match value.to_lowercase().as_str() {
        "none" => Ok(Parity::None),
        "odd" => Ok(Parity::Odd),
        "even" => Ok(Parity::Even),
        _ => Err(format!("unsupported parity: {value}")),
    }
}

fn parse_stop_bits(value: &str) -> Result<StopBits, String> {
    match value.to_lowercase().as_str() {
        "1" | "one" => Ok(StopBits::One),
        "2" | "two" => Ok(StopBits::Two),
        _ => Err(format!("unsupported stop_bits: {value}")),
    }
}

fn build_frame(payload: &[u8]) -> Result<Vec<u8>, String> {
    let payload_len = payload.len();
    if payload_len > MAX_PAYLOAD_LEN {
        return Err("payload too large".to_string());
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

fn read_frame(port: &mut dyn SerialPort) -> io::Result<Vec<u8>> {
    let port_timeout = port.timeout();
    let deadline = Instant::now()
        + if port_timeout == Duration::from_millis(0) {
            Duration::from_millis(FRAME_READ_TIMEOUT_MS)
        } else {
            port_timeout
        };

    loop {
        if Instant::now() >= deadline {
            return Err(io::Error::new(io::ErrorKind::TimedOut, "frame read timeout"));
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
            continue;
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
    fn parse_data_bits_valid() {
        assert!(matches!(parse_data_bits("5"), Ok(DataBits::Five)));
        assert!(matches!(parse_data_bits("five"), Ok(DataBits::Five)));
        assert!(matches!(parse_data_bits("FIVE"), Ok(DataBits::Five)));
        assert!(matches!(parse_data_bits("8"), Ok(DataBits::Eight)));
        assert!(matches!(parse_data_bits("eight"), Ok(DataBits::Eight)));
    }

    #[test]
    fn parse_data_bits_invalid() {
        assert!(parse_data_bits("9").is_err());
        assert!(parse_data_bits("").is_err());
        assert!(parse_data_bits("foo").is_err());
    }

    #[test]
    fn parse_parity_valid() {
        assert!(matches!(parse_parity("none"), Ok(Parity::None)));
        assert!(matches!(parse_parity("NONE"), Ok(Parity::None)));
        assert!(matches!(parse_parity("odd"), Ok(Parity::Odd)));
        assert!(matches!(parse_parity("even"), Ok(Parity::Even)));
    }

    #[test]
    fn parse_parity_invalid() {
        assert!(parse_parity("mark").is_err());
        assert!(parse_parity("space").is_err());
        assert!(parse_parity("").is_err());
    }

    #[test]
    fn parse_stop_bits_valid() {
        assert!(matches!(parse_stop_bits("1"), Ok(StopBits::One)));
        assert!(matches!(parse_stop_bits("one"), Ok(StopBits::One)));
        assert!(matches!(parse_stop_bits("2"), Ok(StopBits::Two)));
        assert!(matches!(parse_stop_bits("TWO"), Ok(StopBits::Two)));
    }

    #[test]
    fn parse_stop_bits_invalid() {
        assert!(parse_stop_bits("3").is_err());
        assert!(parse_stop_bits("1.5").is_err());
        assert!(parse_stop_bits("").is_err());
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
        let payload = vec![0xAA; 252];
        let frame = build_frame(&payload).unwrap();

        assert_eq!(frame.len(), 1 + 1 + 252 + 1);
        let len_field = frame[1];
        assert_eq!(len_field, 253); // 252 + 1 for crc
    }

    #[test]
    fn build_frame_too_large() {
        let payload = vec![0xAA; 253];
        assert!(build_frame(&payload).is_err());
    }

    #[test]
    fn registry_insert_get_remove() {
        let reg = Registry::new();

        // Can't easily test with real SerialPort, but we can test the ID generation
        let id1 = reg.next_id.fetch_add(1, Ordering::Relaxed);
        let id2 = reg.next_id.fetch_add(1, Ordering::Relaxed);
        assert_eq!(id1, 1);
        assert_eq!(id2, 2);
    }
}
