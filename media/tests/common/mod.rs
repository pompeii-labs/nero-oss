//! Shared integration-test harness for the media sidecar.
//!
//! Every sidecar binds an OS-assigned port (`127.0.0.1:0`) and reports its real
//! address through the event stream, so tests never hardcode a port (Lux harness
//! convention). The injected callbacks funnel lifecycle events to the test over a
//! channel; `Drop` aborts the server task.

use std::sync::Arc;

use nero_media::{run_with_config, Config, InfoEvent, WarnEvent};
use tokio::sync::mpsc::{unbounded_channel, UnboundedReceiver};

#[derive(Debug)]
pub enum Event {
    Info(InfoEvent),
    Warn(WarnEvent),
}

pub struct Sidecar {
    pub addr: String,
    rx: UnboundedReceiver<Event>,
    task: tokio::task::JoinHandle<std::io::Result<()>>,
}

impl Sidecar {
    /// Start a sidecar on an OS-assigned port; returns once it is listening.
    pub async fn start() -> Sidecar {
        let (tx, mut rx) = unbounded_channel();
        let tx_info = tx.clone();
        let tx_warn = tx;
        let config = Config {
            bridge_addr: "127.0.0.1:0".to_string(),
            rtc_host: None,
            udp_port: 0,
            on_info: Some(Arc::new(move |e| {
                let _ = tx_info.send(Event::Info(e));
            })),
            on_warn: Some(Arc::new(move |e| {
                let _ = tx_warn.send(Event::Warn(e));
            })),
            on_error: None,
        };
        let task = tokio::spawn(run_with_config(config));
        let addr = loop {
            match rx.recv().await.expect("sidecar exited before listening") {
                Event::Info(InfoEvent::BridgeListening { addr }) => break addr,
                _ => continue,
            }
        };
        Sidecar { addr, rx, task }
    }

    pub fn url(&self) -> String {
        format!("ws://{}", self.addr)
    }

    /// The next event of any kind; panics if the stream closes.
    pub async fn next(&mut self) -> Event {
        self.rx.recv().await.expect("sidecar event stream closed")
    }

    /// The next info event, skipping warns.
    pub async fn next_info(&mut self) -> InfoEvent {
        loop {
            if let Event::Info(e) = self.next().await {
                return e;
            }
        }
    }
}

impl Drop for Sidecar {
    fn drop(&mut self) {
        self.task.abort();
    }
}
