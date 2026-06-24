//! The agent <-> sidecar bridge WebSocket. One connection from the agent,
//! multiplexing every peer by id. It is a relay: control frames go to the media
//! plane (`control_tx`), and the media plane's replies (`out`) go back out the
//! socket. Binary PCM frames arrive in M2.

use std::sync::Arc;

use futures_util::{SinkExt, StreamExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{broadcast, mpsc};
use tokio_tungstenite::tungstenite::Message;

use crate::event::{emit_error, emit_info, emit_warn};
use crate::proto::Control;
use crate::{Config, ErrorEvent, InfoEvent, WarnEvent};

/// Bind the bridge and accept agent connections until the process exits.
pub async fn serve(
    config: Arc<Config>,
    control_tx: mpsc::UnboundedSender<Control>,
    out_tx: broadcast::Sender<Control>,
    audio_tx: broadcast::Sender<Vec<u8>>,
    tts_tx: mpsc::UnboundedSender<Vec<u8>>,
) -> std::io::Result<()> {
    let listener = match TcpListener::bind(&config.bridge_addr).await {
        Ok(listener) => listener,
        Err(e) => {
            emit_error(
                &config,
                ErrorEvent::BindFailed {
                    addr: config.bridge_addr.clone(),
                    detail: e.to_string(),
                },
            );
            return Err(e);
        }
    };
    let addr = listener
        .local_addr()
        .map(|a| a.to_string())
        .unwrap_or_else(|_| config.bridge_addr.clone());
    emit_info(&config, InfoEvent::BridgeListening { addr });

    loop {
        let (socket, _) = listener.accept().await?;
        let config = config.clone();
        let control_tx = control_tx.clone();
        let out_rx = out_tx.subscribe();
        let audio_rx = audio_tx.subscribe();
        let tts_tx = tts_tx.clone();
        tokio::spawn(async move {
            if let Err(e) = handle(socket, &config, control_tx, out_rx, audio_rx, tts_tx).await {
                emit_warn(
                    &config,
                    WarnEvent::BridgeError {
                        detail: e.to_string(),
                    },
                );
            }
        });
    }
}

/// Relay one agent connection: control frames in to the media plane, media-plane
/// replies out, pings answered.
async fn handle(
    socket: TcpStream,
    config: &Arc<Config>,
    control_tx: mpsc::UnboundedSender<Control>,
    mut out_rx: broadcast::Receiver<Control>,
    mut audio_rx: broadcast::Receiver<Vec<u8>>,
    tts_tx: mpsc::UnboundedSender<Vec<u8>>,
) -> std::io::Result<()> {
    let ws = tokio_tungstenite::accept_async(socket)
        .await
        .map_err(io_err)?;
    emit_info(config, InfoEvent::BridgeConnected);
    let (mut tx, mut rx) = ws.split();

    loop {
        tokio::select! {
            incoming = rx.next() => {
                let Some(incoming) = incoming else { break };
                match incoming.map_err(io_err)? {
                    Message::Text(text) => match serde_json::from_str::<Control>(text.as_str()) {
                        Ok(control) => { let _ = control_tx.send(control); }
                        Err(e) => emit_warn(config, WarnEvent::BadControlMessage { detail: e.to_string() }),
                    },
                    // Inbound binary = TTS PCM from the agent, to the media plane.
                    Message::Binary(bytes) => {
                        let _ = tts_tx.send(bytes.to_vec());
                    }
                    Message::Ping(payload) => tx.send(Message::Pong(payload)).await.map_err(io_err)?,
                    Message::Close(_) => break,
                    _ => {}
                }
            }
            outgoing = out_rx.recv() => {
                match outgoing {
                    Ok(control) => {
                        let json = serde_json::to_string(&control).map_err(io_err)?;
                        tx.send(Message::text(json)).await.map_err(io_err)?;
                    }
                    Err(broadcast::error::RecvError::Lagged(_)) => {}
                    Err(broadcast::error::RecvError::Closed) => break,
                }
            }
            frame = audio_rx.recv() => {
                // Mic PCM (a framed binary packet) out to the agent.
                match frame {
                    Ok(bytes) => tx.send(Message::binary(bytes)).await.map_err(io_err)?,
                    Err(broadcast::error::RecvError::Lagged(_)) => {}
                    Err(broadcast::error::RecvError::Closed) => break,
                }
            }
        }
    }

    emit_info(config, InfoEvent::BridgeClosed);
    Ok(())
}

fn io_err<E: std::fmt::Display>(e: E) -> std::io::Error {
    std::io::Error::new(std::io::ErrorKind::Other, e.to_string())
}
