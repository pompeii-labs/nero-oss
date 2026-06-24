//! The agent <-> sidecar bridge wire format.
//!
//! One WebSocket carries two kinds of frame:
//!   - Text frames  = JSON [`Control`] messages (signaling relay + barge-in).
//!   - Binary frames = a fixed [`AudioHeader`] followed by little-endian PCM i16.
//!
//! Mirrored on the agent side in `src/voice/proto.ts`. Keep the two in lockstep.

use serde::{Deserialize, Serialize};

/// Control messages over the bridge (JSON text frames). `peer` is the per-device
/// id the agent assigns when a browser starts a voice session.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "t", rename_all = "snake_case")]
pub enum Control {
    /// Agent -> sidecar: a browser SDP offer to terminate. (The agent relays
    /// signaling between the browser and the sidecar; it never parses SDP.)
    PeerOpen { peer: u32, sdp_offer: String },
    /// Sidecar -> agent: the SDP answer to relay back to the browser.
    PeerAnswer { peer: u32, sdp: String },
    /// Either direction: a trickled ICE candidate.
    Ice { peer: u32, candidate: String },
    /// Either direction: the peer was torn down.
    PeerClose { peer: u32 },
    /// Agent -> sidecar: stop talking NOW (barge-in). Flush any queued outbound
    /// audio for `peer`. The one latency-critical control.
    Interrupt { peer: u32 },
    /// Agent -> sidecar: agent-speech on/off, for echo bookkeeping.
    Speaking { peer: u32, on: bool },
}

/// Which way a binary audio frame flows.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Direction {
    /// Sidecar -> agent: the user's mic, downsampled to 16 kHz for Deepgram Flux.
    Mic = 0,
    /// Agent -> sidecar: TTS audio at 48 kHz, encoded to Opus for the browser.
    Tts = 1,
}

impl Direction {
    fn from_u8(v: u8) -> Option<Direction> {
        match v {
            0 => Some(Direction::Mic),
            1 => Some(Direction::Tts),
            _ => None,
        }
    }
}

/// 12-byte little-endian header prefixing the PCM payload of a binary frame.
#[derive(Debug, Clone, Copy)]
pub struct AudioHeader {
    pub peer: u32,
    pub dir: Direction,
    /// Sample rate in kHz (16 for mic, 48 for tts) — full rate doesn't fit u16
    /// cleanly and kHz is plenty of resolution.
    pub rate_khz: u16,
    pub seq: u32,
}

pub const AUDIO_HEADER_LEN: usize = 12;

impl AudioHeader {
    /// Write the header, then the caller appends the PCM samples.
    pub fn write(&self, out: &mut Vec<u8>) {
        out.extend_from_slice(&self.peer.to_le_bytes());
        out.push(self.dir as u8);
        out.push(0); // reserved
        out.extend_from_slice(&self.rate_khz.to_le_bytes());
        out.extend_from_slice(&self.seq.to_le_bytes());
    }

    /// Parse the header off the front of a binary frame, returning it and the
    /// remaining PCM bytes. `None` on a short or malformed frame.
    pub fn read(buf: &[u8]) -> Option<(AudioHeader, &[u8])> {
        if buf.len() < AUDIO_HEADER_LEN {
            return None;
        }
        let peer = u32::from_le_bytes(buf[0..4].try_into().ok()?);
        let dir = Direction::from_u8(buf[4])?;
        let rate_khz = u16::from_le_bytes(buf[6..8].try_into().ok()?);
        let seq = u32::from_le_bytes(buf[8..12].try_into().ok()?);
        Some((
            AudioHeader {
                peer,
                dir,
                rate_khz,
                seq,
            },
            &buf[AUDIO_HEADER_LEN..],
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Every control variant survives a JSON round-trip unchanged. `Control`
    /// isn't `PartialEq`, so we compare canonical re-serializations.
    #[test]
    fn control_round_trips() {
        let cases = [
            Control::PeerOpen {
                peer: 7,
                sdp_offer: "v=0\r\n".into(),
            },
            Control::PeerAnswer {
                peer: 7,
                sdp: "v=0\r\n".into(),
            },
            Control::Ice {
                peer: 7,
                candidate: "candidate:1 1 udp ...".into(),
            },
            Control::PeerClose { peer: 7 },
            Control::Interrupt { peer: 7 },
            Control::Speaking { peer: 7, on: true },
        ];
        for case in cases {
            let json = serde_json::to_string(&case).unwrap();
            let back: Control = serde_json::from_str(&json).unwrap();
            assert_eq!(
                json,
                serde_json::to_string(&back).unwrap(),
                "round-trip drift: {json}"
            );
        }
    }

    /// The wire tag is snake_case `t` — the Bun side parses on this exact shape.
    #[test]
    fn control_tag_is_snake_case() {
        let json = serde_json::to_string(&Control::Interrupt { peer: 1 }).unwrap();
        assert!(json.contains(r#""t":"interrupt""#), "{json}");
    }

    /// The exact frame the Bun side sends on barge-in must deserialize. Guards the
    /// wire contract from drift on either side.
    #[test]
    fn parses_the_bun_interrupt_frame() {
        let parsed: Control = serde_json::from_str(r#"{"t":"interrupt","peer":3}"#).unwrap();
        assert!(matches!(parsed, Control::Interrupt { peer: 3 }));
    }

    #[test]
    fn audio_header_round_trips_with_payload() {
        let header = AudioHeader {
            peer: 42,
            dir: Direction::Mic,
            rate_khz: 16,
            seq: 9001,
        };
        let mut buf = Vec::new();
        header.write(&mut buf);
        buf.extend_from_slice(&[1, 2, 3, 4]); // stand-in PCM
        assert_eq!(buf.len(), AUDIO_HEADER_LEN + 4);

        let (parsed, pcm) = AudioHeader::read(&buf).expect("parse");
        assert_eq!(parsed.peer, 42);
        assert_eq!(parsed.dir, Direction::Mic);
        assert_eq!(parsed.rate_khz, 16);
        assert_eq!(parsed.seq, 9001);
        assert_eq!(pcm, &[1, 2, 3, 4]);
    }

    #[test]
    fn audio_header_rejects_short_frame() {
        assert!(AudioHeader::read(&[0u8; 4]).is_none());
    }

    #[test]
    fn audio_header_rejects_bad_direction() {
        let mut buf = Vec::new();
        AudioHeader {
            peer: 1,
            dir: Direction::Tts,
            rate_khz: 48,
            seq: 1,
        }
        .write(&mut buf);
        buf[4] = 99; // corrupt the direction byte
        assert!(AudioHeader::read(&buf).is_none());
    }
}
