# Nero — iOS app

A **fully native SwiftUI** client for Nero (no WKWebView). It talks to Nero's HTTP
API directly and renders the Field natively: chat, voice, generative panels, and the
interactive project/ask/merge cards.

## Build & run
```
cd ios
xcodegen generate                 # regenerates Nero.xcodeproj (gitignored) from project.yml
open Nero.xcodeproj
```
In Xcode: select the **Nero** scheme, set your signing **Team** on the target, run on a
device (voice needs a real mic; the simulator has none). On first launch enter your
Nero URL (a Tailscale hostname like `your-nero.ts.net`, or a LAN IP).

CI/headless build check (no signing, no device):
```
xcodegen generate
xcodebuild -project Nero.xcodeproj -scheme Nero -sdk iphonesimulator \
  -configuration Debug -destination 'generic/platform=iOS Simulator' \
  build CODE_SIGNING_ALLOWED=NO
```

## Architecture
- **Core/** — `NeroClient` (HTTP: send, cancel, panel/ask/project actions, secrets,
  mcp, push), `RealtimeStream` (parses the `/v1/stream` SSE feed by hand), `NeroStore`
  (`@MainActor ObservableObject`, owns the connection + all Field state), `Models` /
  `Panels` (Codable, incl. the panel `Comp` tree + `Bound` bindings).
- **Design/** — `Theme` (Obsidian + Forge palettes verbatim from the web tokens),
  `Typeface` (serif wordmark / sans body / mono labels), `Glass` modifier + `Atmosphere`,
  `Motion` (the two signature easings).
- **Field/** — `FieldView` (root), `Orb` (from-scratch SwiftUI, all four states),
  `MessageBubble`/`ToolGroup`, `Composer`, `PresenceView` + `VoiceSession`
  (AVAudioEngine + the `/v1/voice` WS, half-duplex).
- **Panels/** — `PanelComponentView` (all 14 component types), `ChartView` (Swift
  Charts), `PanelStack`/`PanelCard`.
- **Cards/** — `AskCard` (question wizard), project approval / dashboard / merge cards.
- **Settings/** — onboarding + settings (connection, theme, secrets, MCP).

## Realtime
The web subscribes to Lux directly; the native app gets the same data from the api's
`GET /v1/stream` SSE bridge (message / dispatch / panel / question / project / task
events). Writes use the normal REST endpoints. No Lux client in Swift.

## Push
`AppDelegate` registers for APNs and POSTs the token to `/v1/push/register`. Delivery
needs an APNs `.p8` auth key configured as Nero secrets (see the api `apns` medium).

## Auth
None in-app: the network boundary (Tailscale) is the auth. Fine for personal/TestFlight;
a public release needs real auth first.
