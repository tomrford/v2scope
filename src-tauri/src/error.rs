use serde::Serialize;
use thiserror::Error;

#[derive(Error, Debug, Serialize)]
#[serde(tag = "type", content = "data")]
pub enum SerialError {
    #[error("port not found: {path}")]
    PortNotFound { path: String },

    #[error("port busy: {path}")]
    PortBusy { path: String },

    #[error("invalid handle: {handle_id}")]
    InvalidHandle { handle_id: u64 },

    #[error("timeout")]
    Timeout,

    #[error("crc mismatch")]
    CrcMismatch,

    #[error("io error: {message}")]
    IoError { message: String },

    #[error("invalid config: {message}")]
    InvalidConfig { message: String },

    #[error("payload too large")]
    PayloadTooLarge,
}

impl From<std::io::Error> for SerialError {
    fn from(err: std::io::Error) -> Self {
        match err.kind() {
            std::io::ErrorKind::TimedOut => SerialError::Timeout,
            _ => SerialError::IoError {
                message: err.to_string(),
            },
        }
    }
}

impl From<serialport::Error> for SerialError {
    fn from(err: serialport::Error) -> Self {
        match err.kind {
            serialport::ErrorKind::NoDevice => SerialError::PortNotFound {
                path: err.to_string(),
            },
            serialport::ErrorKind::Io(io_kind) => match io_kind {
                std::io::ErrorKind::TimedOut => SerialError::Timeout,
                std::io::ErrorKind::PermissionDenied => SerialError::PortBusy {
                    path: err.to_string(),
                },
                _ => SerialError::IoError {
                    message: err.to_string(),
                },
            },
            serialport::ErrorKind::InvalidInput => SerialError::InvalidConfig {
                message: err.to_string(),
            },
            _ => SerialError::IoError {
                message: err.to_string(),
            },
        }
    }
}
