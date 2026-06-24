//! The sidecar's error type. A plain enum (Lux style, no anyhow/thiserror);
//! network operations surface as `std::io::Result` at boundaries.

use std::fmt;

#[derive(Debug)]
pub enum MediaError {
    /// A malformed control message or unexpected wire shape.
    Protocol(String),
    /// Opus encode/decode failure.
    Codec(String),
    /// WebRTC (str0m) failure.
    Rtc(String),
}

impl fmt::Display for MediaError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            MediaError::Protocol(m) => write!(f, "protocol: {m}"),
            MediaError::Codec(m) => write!(f, "codec: {m}"),
            MediaError::Rtc(m) => write!(f, "rtc: {m}"),
        }
    }
}

impl std::error::Error for MediaError {}
