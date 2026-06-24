//! The `nero-media` binary.
//!
//! A thin bootstrap: read the environment into a `Config`, run the sidecar, and
//! format its lifecycle events to stdout/stderr. All behaviour lives in the
//! library, which stays silent and reports through callbacks (Lux engine style).

use std::sync::Arc;

use nero_media::{run_with_config, Config, ErrorEvent, InfoEvent, WarnEvent};

fn main() -> std::io::Result<()> {
    let mut runtime = tokio::runtime::Builder::new_multi_thread();
    runtime.enable_all();
    runtime.build()?.block_on(async_main())
}

async fn async_main() -> std::io::Result<()> {
    let config = Config {
        bridge_addr: env_or("NERO_MEDIA_BRIDGE_ADDR", "0.0.0.0:7070"),
        rtc_host: std::env::var("NERO_MEDIA_RTC_HOST").ok(),
        udp_port: env_parse("NERO_MEDIA_UDP_PORT", 7088),
        on_info: Some(Arc::new(print_info)),
        on_warn: Some(Arc::new(print_warn)),
        on_error: Some(Arc::new(print_error)),
    };
    run_with_config(config).await
}

fn env_or(key: &str, default: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| default.to_string())
}

fn env_parse<T: std::str::FromStr>(key: &str, default: T) -> T {
    std::env::var(key)
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(default)
}

fn print_info(event: InfoEvent) {
    println!("[media] {event}");
}

fn print_warn(event: WarnEvent) {
    eprintln!("[media] warn: {event}");
}

fn print_error(event: ErrorEvent) {
    eprintln!("[media] error: {event}");
}
