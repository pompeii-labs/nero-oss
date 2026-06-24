//! Opus <-> PCM. Thin wrappers over libopus (audiopus) at 48 kHz mono, the rate
//! WebRTC carries. Resampling to 16 kHz for Deepgram Flux lands when PCM starts
//! flowing to the agent (M2/M3); the loopback (M1) stays at 48 kHz end to end.

use audiopus::{coder::Decoder, coder::Encoder, Application, Channels, SampleRate};

use crate::MediaError;

/// 48 kHz mono; WebRTC's default Opus frame is 20 ms = 960 samples.
pub const SAMPLE_RATE: u32 = 48_000;
pub const FRAME_SAMPLES: usize = 960;

const MAX_DECODE_SAMPLES: usize = FRAME_SAMPLES * 6; // up to a 120 ms frame
const MAX_PACKET: usize = 4000; // libopus's max bytes for one frame

/// Decodes inbound Opus packets to 48 kHz mono PCM.
pub struct OpusDecoder {
    inner: Decoder,
}

impl OpusDecoder {
    pub fn new() -> Result<Self, MediaError> {
        let inner = Decoder::new(SampleRate::Hz48000, Channels::Mono)
            .map_err(|e| MediaError::Codec(e.to_string()))?;
        Ok(Self { inner })
    }

    /// Decode one Opus packet into PCM samples.
    pub fn decode(&mut self, packet: &[u8]) -> Result<Vec<i16>, MediaError> {
        let mut out = vec![0i16; MAX_DECODE_SAMPLES];
        let n = self
            .inner
            .decode(Some(packet), &mut out[..], false)
            .map_err(|e| MediaError::Codec(e.to_string()))?;
        out.truncate(n);
        Ok(out)
    }
}

/// Encodes 48 kHz mono PCM frames to Opus for the outbound track.
pub struct OpusEncoder {
    inner: Encoder,
    buf: [u8; MAX_PACKET],
}

impl OpusEncoder {
    pub fn new() -> Result<Self, MediaError> {
        let inner = Encoder::new(SampleRate::Hz48000, Channels::Mono, Application::Voip)
            .map_err(|e| MediaError::Codec(e.to_string()))?;
        Ok(Self {
            inner,
            buf: [0u8; MAX_PACKET],
        })
    }

    /// Encode one PCM frame (expected `FRAME_SAMPLES`) into an Opus packet.
    pub fn encode(&mut self, pcm: &[i16]) -> Result<Vec<u8>, MediaError> {
        let n = self
            .inner
            .encode(pcm, &mut self.buf[..])
            .map_err(|e| MediaError::Codec(e.to_string()))?;
        Ok(self.buf[..n].to_vec())
    }
}

/// Crude 48 kHz -> 16 kHz downsample: average each group of 3 samples (a cheap
/// box-filter decimation). Good enough for STT; upgrade to a windowed-sinc
/// resampler (e.g. rubato) later if transcription suffers.
pub fn downsample_48k_to_16k(pcm: &[i16]) -> Vec<i16> {
    pcm.chunks(3)
        .map(|chunk| {
            let sum: i32 = chunk.iter().map(|&s| s as i32).sum();
            (sum / chunk.len() as i32) as i16
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn downsample_thirds_the_rate() {
        let pcm = vec![0i16; FRAME_SAMPLES]; // 960 @ 48k
        assert_eq!(downsample_48k_to_16k(&pcm).len(), FRAME_SAMPLES / 3); // 320 @ 16k
    }

    #[test]
    fn downsample_preserves_a_constant() {
        let pcm = vec![1234i16; 30];
        let out = downsample_48k_to_16k(&pcm);
        assert!(
            out.iter().all(|&s| s == 1234),
            "constant signal should survive"
        );
    }

    #[test]
    fn encode_then_decode_preserves_frame_length() {
        let mut enc = OpusEncoder::new().unwrap();
        let mut dec = OpusDecoder::new().unwrap();
        let pcm: Vec<i16> = (0..FRAME_SAMPLES)
            .map(|i| ((i as f32 * 0.12).sin() * 8000.0) as i16)
            .collect();

        let packet = enc.encode(&pcm).unwrap();
        assert!(!packet.is_empty(), "opus packet should be non-empty");

        let decoded = dec.decode(&packet).unwrap();
        assert_eq!(
            decoded.len(),
            FRAME_SAMPLES,
            "a 20ms frame decodes to {FRAME_SAMPLES} samples"
        );
    }

    #[test]
    fn silence_round_trips_to_near_silence() {
        let mut enc = OpusEncoder::new().unwrap();
        let mut dec = OpusDecoder::new().unwrap();
        let silence = vec![0i16; FRAME_SAMPLES];

        let packet = enc.encode(&silence).unwrap();
        let decoded = dec.decode(&packet).unwrap();
        let peak = decoded.iter().map(|s| s.unsigned_abs()).max().unwrap_or(0);
        assert!(peak < 50, "silence should stay near-silent, peak={peak}");
    }

    #[test]
    fn a_tone_survives_with_energy() {
        let mut enc = OpusEncoder::new().unwrap();
        let mut dec = OpusDecoder::new().unwrap();
        // 440 Hz-ish tone at 48k
        let pcm: Vec<i16> = (0..FRAME_SAMPLES)
            .map(|i| {
                ((i as f32 * 2.0 * std::f32::consts::PI * 440.0 / 48000.0).sin() * 12000.0) as i16
            })
            .collect();

        let packet = enc.encode(&pcm).unwrap();
        let decoded = dec.decode(&packet).unwrap();
        let peak = decoded.iter().map(|s| s.unsigned_abs()).max().unwrap_or(0);
        assert!(
            peak > 3000,
            "a loud tone should survive the codec, peak={peak}"
        );
    }
}
