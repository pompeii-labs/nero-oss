//! Lifecycle events. The library never prints; it emits these through the
//! `Config` callbacks and the binary formats them. Silent-by-default, like the
//! Lux engine.

use std::fmt;

use crate::Config;

/// Normal, expected lifecycle (startup, connections, peers).
#[derive(Debug, Clone)]
pub enum InfoEvent {
    BridgeListening { addr: String },
    BridgeConnected,
    BridgeClosed,
    PeerOpened { peer: u32 },
    PeerConnected { peer: u32 },
    PeerClosed { peer: u32 },
    PeerInterrupted { peer: u32, dropped_samples: usize },
}

/// Recoverable trouble worth surfacing but not fatal.
#[derive(Debug, Clone)]
pub enum WarnEvent {
    BadControlMessage { detail: String },
    BridgeError { detail: String },
    PeerError { peer: u32, detail: String },
}

/// Fatal conditions that stop the sidecar (or a major subsystem).
#[derive(Debug, Clone)]
pub enum ErrorEvent {
    BindFailed { addr: String, detail: String },
}

impl fmt::Display for InfoEvent {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            InfoEvent::BridgeListening { addr } => write!(f, "bridge listening on {addr}"),
            InfoEvent::BridgeConnected => write!(f, "agent connected to bridge"),
            InfoEvent::BridgeClosed => write!(f, "agent bridge closed"),
            InfoEvent::PeerOpened { peer } => write!(f, "peer {peer} opened"),
            InfoEvent::PeerConnected { peer } => write!(f, "peer {peer} connected (ice)"),
            InfoEvent::PeerClosed { peer } => write!(f, "peer {peer} closed"),
            InfoEvent::PeerInterrupted {
                peer,
                dropped_samples,
            } => {
                write!(
                    f,
                    "peer {peer} interrupted (dropped {dropped_samples} buffered samples)"
                )
            }
        }
    }
}

impl fmt::Display for WarnEvent {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            WarnEvent::BadControlMessage { detail } => write!(f, "bad control message: {detail}"),
            WarnEvent::BridgeError { detail } => write!(f, "bridge error: {detail}"),
            WarnEvent::PeerError { peer, detail } => write!(f, "peer {peer}: {detail}"),
        }
    }
}

impl fmt::Display for ErrorEvent {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ErrorEvent::BindFailed { addr, detail } => {
                write!(f, "failed to bind {addr}: {detail}")
            }
        }
    }
}

pub(crate) fn emit_info(config: &Config, event: InfoEvent) {
    if let Some(on_info) = &config.on_info {
        on_info(event);
    }
}

pub(crate) fn emit_warn(config: &Config, event: WarnEvent) {
    if let Some(on_warn) = &config.on_warn {
        on_warn(event);
    }
}

pub(crate) fn emit_error(config: &Config, event: ErrorEvent) {
    if let Some(on_error) = &config.on_error {
        on_error(event);
    }
}
