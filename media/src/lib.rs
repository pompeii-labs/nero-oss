//! Nero's WebRTC media sidecar.
//!
//! A dumb media bridge: it terminates the browser's WebRTC peer, decodes inbound
//! Opus to PCM and ships it to the agent (Bun) over a local "bridge" WebSocket,
//! and encodes the agent's TTS PCM back to an outbound Opus track. It holds no
//! cognition, STT, the LLM, and TTS all live in the agent. The only control it
//! obeys is `interrupt` (barge-in).
//!
//! The library is silent; it reports lifecycle through the `Config` callbacks so
//! the binary owns formatting (mirrors the Lux engine).

// M0 is the skeleton (bridge socket + protocol). str0m peers and the Opus codec
// land in M1, at which point these become live.
#![allow(dead_code)]

mod bridge;
mod codec;
mod error;
mod event;
mod peer;
mod proto;

pub use error::MediaError;
pub use event::{ErrorEvent, InfoEvent, WarnEvent};

use std::sync::Arc;

use tokio::sync::{broadcast, mpsc};

/// Runtime configuration. Logging is injected as callbacks so the library stays
/// quiet and the binary decides stdout vs stderr and formatting.
pub struct Config {
    /// Address the agent connects to for the control + audio bridge WebSocket.
    pub bridge_addr: String,
    /// Host LAN IP advertised as the WebRTC host ICE candidate. The container's
    /// own address isn't browser-reachable, so this must be the host (e.g. the
    /// Mac Mini's LAN IP / `nero.local`). `None` until M1 wires WebRTC.
    pub rtc_host: Option<String>,
    /// The single shared UDP port every peer uses, so the Docker mapping is one
    /// rule rather than an ephemeral range.
    pub udp_port: u16,

    pub on_info: Option<Arc<dyn Fn(InfoEvent) + Send + Sync>>,
    pub on_warn: Option<Arc<dyn Fn(WarnEvent) + Send + Sync>>,
    pub on_error: Option<Arc<dyn Fn(ErrorEvent) + Send + Sync>>,
}

/// Boot the sidecar: start the WebRTC media plane and the agent bridge.
///
/// `control` carries the agent's commands to the media plane (mpsc, single
/// consumer); `out` carries the media plane's replies — answers, ICE, peer
/// lifecycle — to whichever bridge connection is live (broadcast, so reconnects
/// just re-subscribe).
pub async fn run_with_config(config: Config) -> std::io::Result<()> {
    let config = Arc::new(config);
    let (control_tx, control_rx) = mpsc::unbounded_channel();
    let (out_tx, _out_rx) = broadcast::channel(256);
    // Mic PCM frames, media plane -> bridge -> agent. Generous depth: ~50/s.
    let (audio_tx, _audio_rx) = broadcast::channel(512);
    // TTS PCM frames, agent -> bridge -> media plane.
    let (tts_tx, tts_rx) = mpsc::unbounded_channel();

    tokio::spawn(peer::run(
        config.clone(),
        control_rx,
        out_tx.clone(),
        audio_tx.clone(),
        tts_rx,
    ));
    bridge::serve(config, control_tx, out_tx, audio_tx, tts_tx).await
}
