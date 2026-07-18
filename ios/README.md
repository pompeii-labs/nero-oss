# Nero iOS

A fully native SwiftUI client for Nero. It talks to a Nero server's HTTP/SSE/WebSocket
API directly, with native chat and native voice. There is no WKWebView.

Nero runs at a user-provided URL (a Tailscale hostname like
`https://nero-rig.tailXXXX.ts.net` or a LAN IP like `http://10.0.0.123:4848`).
This app is for personal / TestFlight use. Auth is the network boundary
(Tailscale), so there is no in-app login and no auth header.

## Layout

```
ios/
├── project.yml            # XcodeGen spec (source of truth; builds all of Sources/)
├── Nero.entitlements      # aps-environment = development
├── Resources/
│   └── Info.plist         # mic/camera usage, background remote-notification, ATS
├── Sources/
│   ├── NeroApp.swift          # @main App, wires AppDelegate, hosts RootView
│   ├── AppDelegate.swift      # APNs registration + notification tap handling
│   ├── PushRegistration.swift # POSTs device token to /v1/push/register
│   ├── Models.swift           # Codable models (ChatMessage, Dispatch, Activity, …)
│   ├── NeroClient.swift       # ObservableObject: base URL, send/cancel/health, SSE stream
│   ├── VoiceSession.swift     # ObservableObject: voice WebSocket + AVAudioEngine mic/playback
│   ├── ContentView.swift      # RootView (onboarding vs. chat) + OnboardingView
│   ├── SettingsView.swift     # change / clear the server URL
│   ├── ChatView.swift         # message list, live streaming bubble, tool chips, input bar
│   └── VoiceView.swift        # voice orb + transcript + mic button
└── README.md
```

The `.xcodeproj` is generated, not committed. Regenerate any time `project.yml`
changes.

## Architecture

### NeroClient (chat + realtime)

`NeroClient` is a `@MainActor ObservableObject` that owns the base URL and the
realtime connection. It publishes `[ChatMessage]` and the current `Dispatch?`.

- **Send**: `POST /v1/nero` with `{ "text": … }`.
- **Cancel**: `POST /v1/nero/cancel` (stop button while a turn is in flight).
- **Health**: `GET /v1/health`, falling back to `/health`, for onboarding validation.
- **Stream**: `GET /v1/stream` is a Server-Sent Events feed parsed manually over
  `URLSession.bytes(for:)`. Named events:
  - `message` — a persisted message row (rendered as a user/assistant bubble;
    `system` and tool rows are ignored).
  - `dispatch` — the live in-flight turn (`streaming_text` + tool `activities` +
    `status`). While a dispatch is active a live assistant bubble streams its text
    and shows tool chips; once the persisted assistant message for that dispatch
    arrives, the live bubble is dropped (de-duped by `dispatch_id`).
  - `ready` — history backfill complete.
  The stream reconnects with exponential backoff (capped at 15s) if it drops.

### VoiceSession (native voice)

`VoiceSession` runs full-duplex-capable voice over a single WebSocket to
`GET {base}/v1/voice` (ws/wss), using `AVAudioEngine` directly (no WebView, no
WebRTC):

- **Mic**: an input-node tap captures audio, an `AVAudioConverter` resamples it to
  48kHz mono Int16 PCM, and each buffer is sent as a **binary** WS frame
  (little-endian Int16).
- **Playback**: incoming **binary** WS frames are 48kHz mono Int16 PCM (TTS). They
  are converted to Float32 and scheduled on an `AVAudioPlayerNode`.
- **Control**: incoming **text** WS frames are JSON —
  `{ "type": "turn", "state": "thinking|listening|speaking" }`,
  `{ "type": "transcript", "text", "final" }`,
  `{ "type": "activity", … }`, `{ "type": "error", "message" }`. State drives the
  orb and the live transcript.
- **Half-duplex**: the mic tap is muted while state is `speaking` and unmuted on
  `listening`, so Nero doesn't hear himself.
- Audio session is `.playAndRecord` / `.voiceChat`; mic permission is requested via
  `AVAudioApplication.requestRecordPermission`.

## Prerequisites

- Xcode 17+ (built/verified against Xcode 26.6)
- [XcodeGen](https://github.com/yonaskolb/XcodeGen): `brew install xcodegen`

## Generate the project

```bash
cd ios
xcodegen generate
open Nero.xcodeproj
```

## Build for the simulator (no signing needed)

```bash
cd ios
xcodegen generate
xcodebuild -project Nero.xcodeproj -scheme Nero \
  -sdk iphonesimulator -configuration Debug \
  -destination 'generic/platform=iOS Simulator' \
  build CODE_SIGNING_ALLOWED=NO
```

APNs push and the microphone are not delivered on the simulator; the app still
builds and runs, and you can exercise onboarding and chat there. Voice needs a
real device.

## Run on a device

1. `cd ios && xcodegen generate && open Nero.xcodeproj`
2. Select the `Nero` target → Signing & Capabilities.
3. Set your Apple **Team**. Xcode will manage a provisioning profile for
   bundle id `com.pompeii.nero`. The Push Notifications capability is provided
   by `Nero.entitlements` (`aps-environment`); make sure the App ID has the
   Push Notifications capability enabled in the Apple Developer portal.
4. Pick your device and Run.
5. On first launch, enter your Nero server URL and tap **Connect**. Change or
   clear it later via the gear button (Settings).

## Push notifications

On launch the app requests notification authorization and registers with APNs.
When the token arrives it is POSTed to your Nero backend, and re-registration
fires again whenever the server URL is set or changed:

```
POST {serverURL}/v1/push/register
content-type: application/json

{ "token": "<hex device token>", "platform": "ios", "bundle_id": "com.pompeii.nero" }
```

Registration is fire-and-forget (failures are logged, they don't block the UI).

### What the push backend needs from Apple

To send pushes, the Nero backend needs:

- **APNs Auth Key** (`.p8` file) created in the Apple Developer portal
  (Keys → new key with **Apple Push Notifications service (APNs)** enabled).
- **Key ID** (the 10-char ID of that `.p8` key).
- **Team ID** (your 10-char Apple Developer Team ID).
- **Bundle ID**: `com.pompeii.nero`.
- APNs environment: this app ships `aps-environment = development`, so use the
  **sandbox** APNs host (`api.sandbox.push.apple.com`) for development/TestFlight
  debug builds. Switch the entitlement to `production` and use
  `api.push.apple.com` for App Store / production TestFlight distribution.
```
