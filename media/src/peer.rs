//! The WebRTC media plane.
//!
//! One shared UDP socket terminates every browser peer (str0m), demultiplexed by
//! `Rtc::accepts`. M1 loops each peer's inbound Opus straight back to it, you hear
//! yourself, proving the whole transport. The Opus<->PCM bridge to the agent and
//! barge-in land in M2/M5. Sans-IO str0m driven by a tokio `select!` pump.

use std::collections::HashMap;
use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::sync::Arc;
use std::time::{Duration, Instant};

use str0m::change::SdpOffer;
use str0m::media::{Frequency, MediaData, MediaTime, Mid, Pt};
use str0m::net::{Protocol, Receive};
use str0m::{Candidate, Event, IceConnectionState, Input, Output, Rtc};
use tokio::net::UdpSocket;
use tokio::sync::{broadcast, mpsc};

use crate::codec::{OpusDecoder, OpusEncoder, FRAME_SAMPLES};
use crate::event::{emit_info, emit_warn};
use crate::proto::{AudioHeader, Control, Direction, AUDIO_HEADER_LEN};
use crate::{Config, InfoEvent, MediaError, WarnEvent};

struct Peer {
    rtc: Rtc,
    decoder: OpusDecoder,
    encoder: OpusEncoder,
    seq: u32,
    // Outbound TTS state, captured from the first inbound media (same mid + Opus pt).
    audio_mid: Option<Mid>,
    opus_pt: Option<Pt>,
    out_samples: u64,
    tts_buf: Vec<i16>,
    // Wall-clock when the next buffered TTS frame is due to be sent. `None` when the
    // buffer is drained. Pacing output to ~realtime (vs dumping a whole response at
    // once) keeps the browser's jitter buffer from overflowing and dropping audio.
    playout_at: Option<Instant>,
}

/// Send buffered TTS at most this far ahead of its playout time. A cushion for the
/// browser jitter buffer without bursting seconds of audio at once.
const PLAYOUT_LEAD: Duration = Duration::from_millis(250);
/// 20 ms per Opus frame at 48 kHz.
const FRAME_DURATION: Duration = Duration::from_millis(20);

/// Build a peer from a browser SDP offer: add our host candidate, answer. Pure
/// (no I/O) so it's unit-testable against a real str0m-generated offer.
fn accept(sdp_offer: &str, host: SocketAddr) -> Result<(Rtc, String), MediaError> {
    let offer = SdpOffer::from_sdp_string(sdp_offer)
        .map_err(|e| MediaError::Rtc(format!("bad offer: {e}")))?;
    let mut rtc = Rtc::builder().build(Instant::now());
    let candidate = Candidate::host(host, "udp")
        .map_err(|e| MediaError::Rtc(format!("host candidate: {e}")))?;
    rtc.add_local_candidate(candidate);
    let answer = rtc
        .sdp_api()
        .accept_offer(offer)
        .map_err(|e| MediaError::Rtc(format!("accept offer: {e}")))?;
    Ok((rtc, answer.to_sdp_string()))
}

/// Run the media plane until the control channel closes.
pub async fn run(
    config: Arc<Config>,
    mut control_rx: mpsc::UnboundedReceiver<Control>,
    out_tx: broadcast::Sender<Control>,
    audio_out: broadcast::Sender<Vec<u8>>,
    mut tts_rx: mpsc::UnboundedReceiver<Vec<u8>>,
) -> std::io::Result<()> {
    let socket = UdpSocket::bind(("0.0.0.0", config.udp_port)).await?;
    let local_addr = socket.local_addr()?;
    let host_ip: IpAddr = config
        .rtc_host
        .as_ref()
        .and_then(|h| h.parse().ok())
        .unwrap_or(IpAddr::V4(Ipv4Addr::LOCALHOST));
    let host_addr = SocketAddr::new(host_ip, local_addr.port());

    let mut peers: HashMap<u32, Peer> = HashMap::new();
    let mut buf = vec![0u8; 2000];

    loop {
        // Drive each peer's output, then take the soonest timeout to sleep until.
        let mut next = Instant::now() + Duration::from_secs(1);
        let mut dead = Vec::new();
        for (&id, peer) in peers.iter_mut() {
            match drive(id, peer, &socket, &config, &audio_out).await {
                Some(timeout) => next = next.min(timeout),
                None => dead.push(id),
            }
            // Send any TTS frames now due, and wake again when the next one is.
            if let Some(playout_next) = pace_tts(peer, &config) {
                next = next.min(playout_next);
            }
        }
        for id in dead {
            peers.remove(&id);
            emit_info(&config, InfoEvent::PeerClosed { peer: id });
            let _ = out_tx.send(Control::PeerClose { peer: id });
        }

        let sleep = tokio::time::sleep_until(tokio::time::Instant::from_std(next));
        tokio::select! {
            ctrl = control_rx.recv() => match ctrl {
                Some(c) => on_control(c, &mut peers, host_addr, &config, &out_tx),
                None => return Ok(()),
            },
            r = socket.recv_from(&mut buf) => {
                let (n, source) = r?;
                let now = Instant::now();
                let contents: str0m::net::DatagramRecv = match (&buf[..n]).try_into() {
                    Ok(c) => c,
                    Err(_) => continue,
                };
                // Report the destination as the advertised host candidate, not the
                // 0.0.0.0 bind address, so str0m's ICE matches it to our candidate.
                let input = Input::Receive(
                    now,
                    Receive { proto: Protocol::Udp, source, destination: host_addr, contents },
                );
                if let Some(peer) = peers.values_mut().find(|p| p.rtc.accepts(&input)) {
                    let _ = peer.rtc.handle_input(input);
                }
            },
            _ = sleep => {
                let now = Instant::now();
                for peer in peers.values_mut() {
                    let _ = peer.rtc.handle_input(Input::Timeout(now));
                }
            }
            tts = tts_rx.recv() => {
                // A framed TTS PCM packet from the agent: queue it to the peer's track.
                if let Some(frame) = tts {
                    if let Some((header, pcm_bytes)) = AudioHeader::read(&frame) {
                        if header.dir == Direction::Tts {
                            if let Some(peer) = peers.get_mut(&header.peer) {
                                enqueue_tts(peer, &bytes_to_pcm(pcm_bytes));
                            }
                        }
                    }
                }
            }
        }
    }
}

/// Little-endian i16 PCM bytes -> samples.
fn bytes_to_pcm(bytes: &[u8]) -> Vec<i16> {
    bytes
        .chunks_exact(2)
        .map(|c| i16::from_le_bytes([c[0], c[1]]))
        .collect()
}

/// Queue TTS PCM for paced playout. The agent ships a whole response's audio in a
/// burst; buffering here (and draining in `pace_tts`) is what keeps it from
/// overflowing the browser.
fn enqueue_tts(peer: &mut Peer, pcm: &[i16]) {
    if peer.audio_mid.is_none() {
        return; // no negotiated track yet (the user hasn't spoken)
    }
    peer.tts_buf.extend_from_slice(pcm);
}

/// Encode + send buffered TTS as 20 ms Opus frames, paced to ~realtime (up to
/// `PLAYOUT_LEAD` ahead). Returns the wall-clock the next frame is due, so the run
/// loop can wake to send it. Buffering across calls frames arbitrary chunk sizes.
fn pace_tts(peer: &mut Peer, config: &Arc<Config>) -> Option<Instant> {
    let (Some(mid), Some(pt)) = (peer.audio_mid, peer.opus_pt) else {
        return None;
    };
    if peer.tts_buf.len() < FRAME_SAMPLES {
        peer.playout_at = None;
        return None;
    }

    let now = Instant::now();
    // Continue the existing clock if we're still ahead of realtime; if it's fallen
    // behind (a gap, or first frame of a fresh burst), restart from now so we don't
    // dump the backlog at once.
    let mut due = peer.playout_at.unwrap_or(now).max(now);

    while peer.tts_buf.len() >= FRAME_SAMPLES && due <= now + PLAYOUT_LEAD {
        let frame: Vec<i16> = peer.tts_buf.drain(..FRAME_SAMPLES).collect();
        let opus = match peer.encoder.encode(&frame) {
            Ok(o) => o,
            Err(e) => {
                emit_warn(
                    config,
                    WarnEvent::PeerError {
                        peer: 0,
                        detail: e.to_string(),
                    },
                );
                peer.playout_at = None;
                return None;
            }
        };
        let rtp_time = MediaTime::new(peer.out_samples, Frequency::FORTY_EIGHT_KHZ);
        peer.out_samples += FRAME_SAMPLES as u64;
        if let Some(writer) = peer.rtc.writer(mid) {
            let _ = writer.write(pt, now, rtp_time, opus);
        }
        due += FRAME_DURATION;
    }

    if peer.tts_buf.len() >= FRAME_SAMPLES {
        peer.playout_at = Some(due);
        Some(due - PLAYOUT_LEAD) // wake when the next frame enters the lead window
    } else {
        // Keep the clock so a near-immediate next chunk stays continuous; if a real
        // gap follows, the next burst resets to `now`.
        peer.playout_at = Some(due);
        None
    }
}

/// Drain a peer's pending output (send packets, loop media). Returns the next
/// timeout, or `None` if the peer died.
async fn drive(
    id: u32,
    peer: &mut Peer,
    socket: &UdpSocket,
    config: &Arc<Config>,
    audio_out: &broadcast::Sender<Vec<u8>>,
) -> Option<Instant> {
    loop {
        if !peer.rtc.is_alive() {
            return None;
        }
        match peer.rtc.poll_output() {
            Ok(Output::Transmit(t)) => {
                let _ = socket.send_to(&t.contents, t.destination).await;
            }
            Ok(Output::Timeout(t)) => return Some(t),
            Ok(Output::Event(e)) => on_event(id, peer, e, config, audio_out),
            Err(e) => {
                emit_warn(
                    config,
                    WarnEvent::PeerError {
                        peer: id,
                        detail: e.to_string(),
                    },
                );
                peer.rtc.disconnect();
                return None;
            }
        }
    }
}

fn on_event(
    id: u32,
    peer: &mut Peer,
    event: Event,
    config: &Arc<Config>,
    audio_out: &broadcast::Sender<Vec<u8>>,
) {
    match event {
        Event::IceConnectionStateChange(state) => match state {
            IceConnectionState::Connected => {
                emit_info(config, InfoEvent::PeerConnected { peer: id })
            }
            IceConnectionState::Disconnected => peer.rtc.disconnect(),
            _ => {}
        },
        Event::MediaData(data) => on_media(id, peer, data, config, audio_out),
        _ => {}
    }
}

/// Decode the inbound Opus, downsample to 16 kHz, and ship a framed PCM packet
/// to the agent (which feeds it to Deepgram Flux).
fn on_media(
    id: u32,
    peer: &mut Peer,
    data: MediaData,
    config: &Arc<Config>,
    audio_out: &broadcast::Sender<Vec<u8>>,
) {
    // Capture the track + Opus payload type so we can write TTS back on it later.
    if peer.audio_mid.is_none() {
        peer.audio_mid = Some(data.mid);
        peer.opus_pt = Some(data.pt);
    }
    // Opus DTX sends empty comfort-noise packets during silence; nothing to decode.
    if data.data.is_empty() {
        return;
    }
    let pcm = match peer.decoder.decode(&data.data) {
        Ok(pcm) => pcm,
        Err(e) => {
            emit_warn(
                config,
                WarnEvent::PeerError {
                    peer: id,
                    detail: e.to_string(),
                },
            );
            return;
        }
    };

    // Deepgram Flux's stream is configured for 48 kHz linear16, so send the native
    // decode rate, no downsampling (it would otherwise be read 3x too fast).
    let header = AudioHeader {
        peer: id,
        dir: Direction::Mic,
        rate_khz: 48,
        seq: peer.seq,
    };
    peer.seq = peer.seq.wrapping_add(1);

    let mut frame = Vec::with_capacity(AUDIO_HEADER_LEN + pcm.len() * 2);
    header.write(&mut frame);
    for sample in pcm {
        frame.extend_from_slice(&sample.to_le_bytes());
    }
    let _ = audio_out.send(frame);
}

fn on_control(
    control: Control,
    peers: &mut HashMap<u32, Peer>,
    host: SocketAddr,
    config: &Arc<Config>,
    out_tx: &broadcast::Sender<Control>,
) {
    match control {
        Control::PeerOpen { peer, sdp_offer } => match accept(&sdp_offer, host) {
            Ok((rtc, answer)) => {
                let (decoder, encoder) = match (OpusDecoder::new(), OpusEncoder::new()) {
                    (Ok(d), Ok(e)) => (d, e),
                    (Err(e), _) | (_, Err(e)) => {
                        emit_warn(
                            config,
                            WarnEvent::PeerError {
                                peer,
                                detail: e.to_string(),
                            },
                        );
                        return;
                    }
                };
                peers.insert(
                    peer,
                    Peer {
                        rtc,
                        decoder,
                        encoder,
                        seq: 0,
                        audio_mid: None,
                        opus_pt: None,
                        out_samples: 0,
                        tts_buf: Vec::new(),
                        playout_at: None,
                    },
                );
                emit_info(config, InfoEvent::PeerOpened { peer });
                let _ = out_tx.send(Control::PeerAnswer { peer, sdp: answer });
            }
            Err(e) => emit_warn(
                config,
                WarnEvent::PeerError {
                    peer,
                    detail: e.to_string(),
                },
            ),
        },
        Control::PeerClose { peer } => {
            if peers.remove(&peer).is_some() {
                emit_info(config, InfoEvent::PeerClosed { peer });
            }
        }
        // Non-trickle ICE for M1 (the offer carries the browser's candidates and
        // str0m learns ours peer-reflexively); trickle relay can come later.
        Control::Ice { .. } => {}
        // Barge-in: the user started talking over Nero. Drop the buffered TTS
        // backlog so playback stops near-immediately (already-sent RTP is in the
        // browser jitter buffer, tens of ms, and drains on its own). The RTP
        // timestamp counter keeps advancing so the next turn resumes cleanly.
        Control::Interrupt { peer } => {
            if let Some(p) = peers.get_mut(&peer) {
                let dropped = p.tts_buf.len();
                p.tts_buf.clear();
                p.playout_at = None;
                emit_info(
                    config,
                    InfoEvent::PeerInterrupted {
                        peer,
                        dropped_samples: dropped,
                    },
                );
            }
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use str0m::media::{Direction, MediaKind};

    /// A real str0m-generated audio offer is accepted and answered. Exercises the
    /// SDP negotiation without a browser or the network.
    #[test]
    fn accepts_a_real_audio_offer() {
        let mut offerer = Rtc::builder().build(Instant::now());
        offerer.add_local_candidate(
            Candidate::host("127.0.0.1:50000".parse().unwrap(), "udp").unwrap(),
        );
        let mut change = offerer.sdp_api();
        change.add_media(MediaKind::Audio, Direction::SendRecv, None, None, None);
        let (offer, _pending) = change.apply().expect("offer");

        let host: SocketAddr = "127.0.0.1:7088".parse().unwrap();
        let (_rtc, answer) = accept(&offer.to_sdp_string(), host).expect("accept offer");

        assert!(
            answer.contains("m=audio"),
            "answer carries the audio m-line:\n{answer}"
        );
        assert!(
            answer.contains("a=candidate"),
            "answer includes our host candidate:\n{answer}"
        );
    }

    #[test]
    fn rejects_garbage_offer() {
        let host: SocketAddr = "127.0.0.1:7088".parse().unwrap();
        assert!(accept("not an sdp", host).is_err());
    }
}
