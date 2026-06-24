# Nero: Voice

Companion to VISION.md and INTERFACES.md. The voice engine. Living document.

## Goal

You drop into voice mode (the orb is already wired to center + expand on `Cmd+Enter`),
talk to Nero, and he talks back, naturally, with crisp interruption. Airtight enough for
open-room "Jarvis across the room," not just headphones. Built on the cascaded pipeline
(STT → Claude → TTS), never an expensive end-to-end speech model.

## Locked decisions (from research, see memory `nero-voice-architecture`)

- **Cascaded, not E2E.** Anthropic ships no speech-to-speech model; OpenAI Realtime / Gemini
  Live don't run Claude. Cascaded is the only Claude-compatible architecture, and cheaper for
  long sessions (text history vs re-ingested audio tokens).
- **STT: Deepgram Flux** (`flux-general-en`, `/v2/listen`). Fused transcription + semantic
  end-of-turn. Collapses STT + VAD + endpointing into one WebSocket. `eager_eot` for speculative
  LLM start.
- **LLM: Claude via OpenRouter** (existing single key).
- **TTS: ElevenLabs Flash/Turbo v2.5** (request `pcm_48000`), behind a swappable interface so
  Cartesia Sonic is one flag away. NOT v3 (no streaming).
- **Transport: WebRTC** (browser-grade AEC/NS is the whole game for barge-in). Server-side WebRTC
  on Bun is a dead end; **a Rust media sidecar (`str0m`) terminates the peer.** Bun stays the brain.
- **Barge-in: local VAD in the loop** + Flux `StartOfTurn`; Bun sends `interrupt` to the sidecar.

## Topology

```
Browser (SvelteKit)                         the offerer; holds mic+speaker; native AEC/NS/AGC
  │
  │  (1) SDP offer + trickle ICE  ── over the app WebSocket ──►  Bun  (dumb signaling relay)
  │                                                               │  relays offer/ICE ⇄ sidecar
  │  (2) WebRTC media: Opus ⇅ Opus  ──── UDP, LAN, host cand ───► Rust media sidecar
  ▼                                                               │
Rust media sidecar  [container: nero-media]                       │  str0m · audiopus · tokio
  • str0m Rtc peer per device (ICE/DTLS/SRTP/RTP, Frame API)       │
  • in:  Opus frame → decode → 48k→16k PCM ─┐                      │
  • out: 48k PCM → encode Opus → Writer ◄───┤  bridge WS          │
  • interrupt → flush outbound instantly     │  (binary PCM +      │
                                             ▼   JSON control)     ▼
Bun + Hono  [container: nero-api]  — THE BRAIN
  • Deepgram Flux WS (16k linear16 in → transcript + EOT events)
  • Claude via OpenRouter
  • ElevenLabs WS (text in → pcm_48000 out)
  • turn-taking + barge-in state machine → `interrupt` to sidecar
  • persists each turn to Lux `messages` (voice + chat share one history)
```

Media (Opus/SRTP/UDP) flows **browser ⇄ sidecar directly**. Bun never touches media bytes;
it relays signaling and shuttles PCM + control over one local "bridge" WebSocket.

---

## Component 1 — the Rust media sidecar (`nero-media`)

A new crate at `media/` in this repo, built into the `nero-media` container. Written in the
**Lux house style** (see below). It is a *dumb media bridge*: WebRTC + Opus codec only, zero
cognition. Everything it knows how to do is move audio and obey `interrupt`.

### Crate layout (single crate + thin binary, Lux-style)

```
media/
  Cargo.toml            edition 2021; release profile lto+codegen-units=1+strip+panic=abort
  src/
    main.rs             thin: tokio multi-thread runtime, env → Config, run(), event printing → stdout/stderr
    lib.rs              run_with_config(Config) -> Handle; Config (with on_info/on_warn/on_error callbacks)
    bridge.rs           the Bun control/audio WebSocket (tokio-tungstenite server). One conn, multiplexed by peer_id.
    peer.rs             str0m Rtc per peer: the sans-IO UDP socket + timeout pump; Frame API (Opus in/out)
    codec.rs            audiopus encode/decode + 48k⇄16k resample
    proto.rs            wire types (serde): bridge control messages + the binary audio frame header
    event.rs            SidecarInfoEvent / WarnEvent / ErrorEvent + emit_* helpers (no tracing/log)
    error.rs            MediaError enum; io::Result<T> at boundaries
```

### Dependencies

`str0m` (sans-IO WebRTC; chosen over `webrtc-rs`), `audiopus` (libopus 1.3 enc/dec),
`tokio` (full), `tokio-tungstenite` 0.24, `parking_lot`, `serde` + `serde_json`, `bytes`,
maybe `rubato` for resampling (or hand-roll the 48k⇄16k). Pin + verify the `audiopus` static
link in the Docker base (single-maintainer watch item; fallbacks: `opus`/system libopus).

### The str0m loop (sans-IO pump, per peer)

str0m gives a complete WebRTC peer (ICE/DTLS/SRTP/RTP, SDP via `SdpApi::accept_offer`) but no
codecs and no I/O. We own the socket + timer:

```
loop {
    match rtc.poll_output() {
        Output::Timeout(t)  => schedule wakeup at t,
        Output::Transmit(x) => udp.send_to(x.contents, x.destination),
        Output::Event(ev)   => match ev {
            Event::IceConnectionStateChange(..) => emit_info,
            Event::MediaData(m) => { opus = m.data; pcm = decoder.decode(opus); pcm16 = down(48k→16k); bridge.send_audio(peer, MIC, pcm16) }
            ..
        }
    }
    tokio::select! {
        _ = udp.readable()     => { n = udp.recv; rtc.handle_input(Input::Receive(now, packet)) }
        _ = sleep_until(timeout) => { rtc.handle_input(Input::Timeout(now)) }
        frame = bridge.tts_rx() => { opus = encoder.encode(frame.pcm48k); writer.write(opus) }  // outbound TTS
        _ = bridge.interrupt_rx() => { drop queued outbound; stop writing until next turn }
    }
}
```

Use the **Frame API** (`Event::MediaData` / `Writer::write`), not raw RTP. One `Rtc` per peer;
the sidecar holds `HashMap<PeerId, PeerTask>` (parking_lot::RwLock). Per-peer task spawned via
`tokio::spawn`; graceful shutdown via `watch` + `JoinSet::abort_all`, exactly like Lux's accept loop.

### Single UDP port for Docker sanity

Configure str0m to use **one shared UDP port** for all peers (not a per-peer ephemeral range), so
the compose mapping is a single `udp` publish. The sidecar advertises a **host ICE candidate** =
the host's LAN IP (`NERO_MEDIA_RTC_HOST`, e.g. the Mac Mini's address / `nero.local` resolved),
because the container's internal IP isn't browser-reachable. It must also **resolve the browser's
mDNS `xxxx.local` candidates** (modern browsers hide private IPs). On `nero.local` LAN: **no TURN,
no STUN** — host candidates connect directly. Add `coturn` as a container later only for off-LAN.

### Config (env, Lux-style)

`NERO_MEDIA_BRIDGE_ADDR` (ws the Bun brain connects to, e.g. `0.0.0.0:7070`),
`NERO_MEDIA_RTC_HOST` (host LAN IP to advertise), `NERO_MEDIA_UDP_PORT` (single shared, e.g. 7088),
`NERO_MEDIA_LOG` (level for the binary's event printer). No config files.

### Logging

Library is silent; emits `SidecarInfoEvent::{BridgeConnected, PeerOpened{id}, IceConnected{id}, PeerClosed{id}}`,
`SidecarWarnEvent::{IceFailed, OpusDecodeError, ..}`, `SidecarErrorEvent::{BindFailed, BridgeDropped}` via
callbacks. `main.rs` formats them to stdout/stderr (mirrors Lux's `print_info_event`).

---

## Component 2 — the Bun brain (voice orchestration)

Lives in the existing `nero-api` service. New module `src/voice/`.

```
src/voice/
  session.ts      one VoiceSession per active peer: owns the Flux WS, the turn state machine, the TTS stream
  bridge.ts       the WebSocket CLIENT to the sidecar: send/recv framed PCM + JSON control; route by peer_id
  flux.ts         Deepgram Flux client (wss .../v2/listen, model flux-general-en); emits StartOfTurn/Eager/EndOfTurn/transcript
  tts.ts          TTS interface synthesizeStream(text) -> AsyncIterable<pcm48k>; impls: elevenlabs.ts (+ cartesia.ts later)
  turn.ts         the state machine: listening → (eager) thinking → speaking, with barge-in
  index.ts        wires a session: bridge PCM → Flux → Claude (reuse harness/dispatch) → TTS → bridge; persists turns to Lux
```

Reuse `@pompeii-labs/audio`'s `DeepgramFluxSTT` + `ElevenLabsTTS` if `MagmaFlow` drives Flux's
EOT events well; otherwise call them directly (same package, lower level). The LLM step reuses the
existing **harness** (NeroAgent + session history + memory recall) so voice and chat are one mind.

### Turn state machine (the heart)

- **listening**: mic PCM streaming to Flux. Local lightweight VAD (or Flux `StartOfTurn`) marks
  speech start. Orb → `thinking` is held until end-of-turn.
- **eager** (optional): on Flux `EagerEndOfTurn`, speculatively start the Claude call; cancel on
  `TurnResumed`. ~150-250ms head start.
- **thinking**: on `EndOfTurn`, commit the transcript, persist the user turn to Lux, run the agent.
  Orb → `thinking` (the neural-fire state we built).
- **speaking**: stream Claude's text into TTS **on sentence boundaries** (don't wait for full
  completion), pipe `pcm48k` frames over the bridge to the sidecar. Orb → `speaking`.
- **barge-in**: while speaking, if the user starts a qualified turn (min words, so "mm-hmm"
  backchannels don't cut him off), send `interrupt` to the sidecar (flush outbound), stop the TTS
  stream, persist the partial assistant turn, return to listening.

### Persistence

Each turn writes to Lux `messages` (role user/assistant, `medium: 'voice'`) so the voice
conversation and the typed transcript are one unified history. Voice does NOT go through the
single-flight HTTP dispatch; it's its own loop, but it writes the same rows.

---

## Component 3 — the browser client (SvelteKit)

New `web/src/lib/voice/`:

```
voice/
  peer.ts         RTCPeerConnection: getUserMedia({audio:{echoCancellation,noiseSuppression,autoGainControl}}),
                  create offer, add mic track, play inbound track via an <audio> sink (so AEC sees it)
  signal.ts       send offer + trickle ICE over the app WS; apply answer + remote candidates
  index.ts        startVoice()/stopVoice(); exposes a state store (idle/connecting/listening/thinking/speaking)
```

The voice-mode LAYOUT is already built (`Cmd+Enter` → orb centers + expands, chrome clears).
Entering voice mode calls `startVoice()`; the session state drives the orb (`orbState`):
`listening` → `thinking` → `speaking`. The "listening" state is a new gentle orb pulse;
`thinking`/`tool` reuse what we built. Critically: **play the inbound audio through a real
`<audio>`/MediaStream sink** so the browser's AEC can observe it (the whole reason for WebRTC).

---

## Protocols

### Browser ⇄ Bun signaling (over the app WebSocket)

`voice.start {}` · `voice.offer {sdp}` · `voice.answer {sdp}` · `voice.ice {candidate}` · `voice.stop {}`.
Bun relays offer/ICE to the sidecar and the sidecar's answer/ICE back. Bun does not parse SDP.

### Bun ⇄ sidecar bridge (one WebSocket)

- **Text frames = JSON control:** `peer.open {peer_id, sdp_offer}` → `peer.answer {peer_id, sdp}`,
  `ice {peer_id, candidate}` (both ways), `peer.close {peer_id}`, `interrupt {peer_id}` (Bun→sidecar),
  `speaking {peer_id, on}` (Bun→sidecar, lets the sidecar know agent-speech state for echo logic).
- **Binary frames = audio:** little-endian header `[peer_id u32][dir u8][rate u32][seq u32]` + PCM
  `i16` payload. `dir`: `0` = mic (sidecar→Bun, 16k), `1` = tts (Bun→sidecar, 48k). 20ms frames.

---

## Compose + env

Add a `media` service (build `Dockerfile.media`, a Rust multi-stage build):

```yaml
  media:
    image: ghcr.io/pompeii-labs/nero-media:latest   # or build: .
    restart: unless-stopped
    environment:
      NERO_MEDIA_BRIDGE_ADDR: "0.0.0.0:7070"
      NERO_MEDIA_RTC_HOST: "${NERO_HOST_IP}"         # host LAN IP / nero.local
      NERO_MEDIA_UDP_PORT: "7088"
    ports:
      - "7088:7088/udp"                              # the one shared media port, published to LAN
  # api connects to media's bridge at ws://media:7070 over the compose network
```

`config.ts` (Bun) gains a `voice` section: `mediaBridgeUrl` (`ws://media:7070`), `sttModel`
(`flux-general-en`), `ttsVoice`/`ttsModel` (ElevenLabs), the eager/eot thresholds. Keys
(`DEEPGRAM_API_KEY`, `ELEVENLABS_API_KEY`) are already in `.env`.

---

## Build sequence (each milestone ships green; M1 is the keystone de-risk)

**M0 — sidecar skeleton.** `media/` crate, `main.rs`+`lib.rs`, Config + event callbacks, the bridge
WS server (accepts Bun, logs), env config, `Dockerfile.media`, compose `media` service. Does nothing
but connect + log.

**M1 — WebRTC loopback (the scary part, proven first).** Browser `peer.ts` (mic + AEC, offerer) →
signaling over app WS → Bun relays → sidecar str0m peer accepts, receives Opus, decodes, **re-encodes
and writes it straight back** as a track → browser plays → *you hear yourself, clean, with AEC*. No AI.
This proves str0m + audiopus + ICE + the mDNS/host-candidate/single-UDP-port Docker story + signaling
end to end. If M1 works, the unknowns are gone.

**M2 — bridge PCM to Bun.** Sidecar ships 16k mic PCM to Bun over the bridge; Bun loops it back (or
logs RMS) → sidecar plays it. Proves the sidecar⇄Bun audio pipe + framing.

**M3 — ears.** Bun feeds PCM to Deepgram Flux; log transcripts + `EndOfTurn`. Orb → listening/thinking.

**M4 — full turn.** Flux `EndOfTurn` → Claude (harness) → ElevenLabs `pcm_48000` → bridge → sidecar →
browser. You talk, Nero answers in voice. Orb listening→thinking→speaking. Persist turns to Lux.

**M5 — barge-in.** Flux `StartOfTurn` / VAD → Bun `interrupt` → sidecar flush. Qualify interruptions
(min words). Tune `eot_threshold` / `eager_eot_threshold`.

**M6 — polish.** Eager speculative start, TTS sentence-chunking, reconnection/error handling, the
"listening" orb state, multi-peer scaffolding (toward presence/multi-display).

---

## Watch items / open questions

- `audiopus` static link in the Rust Docker base (single maintainer; fallback `opus`/system libopus).
- str0m sans-IO pump correctness (jitter/pacing) — start from str0m's chat example loop.
- mDNS `.local` candidate resolution + the one-time macOS "Local Network" permission prompt.
- Does `MagmaFlow` drive Flux's EOT events well, or do we call `DeepgramFluxSTT`/`ElevenLabsTTS` directly?
- `NERO_HOST_IP` discovery (auto-detect host LAN IP vs user-set in `.env`).
- Multi-display routing policy (which peer is "active") — deferred to the presence/wakeword phase, but
  the sidecar's per-peer `Rtc` map is built to grow into it.
