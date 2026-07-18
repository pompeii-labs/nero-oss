# Nero iOS

A thin native SwiftUI shell around Nero's mobile-responsive web UI (the "Field"),
loaded in a `WKWebView`, plus native APNs push registration.

Nero runs at a user-provided HTTPS URL (a Tailscale hostname like
`https://nero-rig.tailXXXX.ts.net` or a LAN IP like `http://10.0.0.123:4848`).
This app is for personal / TestFlight use. Auth is the network boundary
(Tailscale), so there is no in-app login for v1.

## Layout

```
ios/
├── project.yml            # XcodeGen spec (source of truth for the project)
├── Nero.entitlements      # aps-environment = development
├── Resources/
│   └── Info.plist         # mic/camera usage, background remote-notification, ATS
├── Sources/
│   ├── NeroApp.swift          # @main App, wires AppDelegate
│   ├── AppDelegate.swift      # APNs registration + notification tap handling
│   ├── ContentView.swift      # onboarding vs. full-screen web view
│   ├── WebView.swift          # WKWebView wrapper (voice, pull-to-refresh)
│   └── PushRegistration.swift # POSTs device token to the backend
└── README.md
```

The `.xcodeproj` is generated, not committed. Regenerate any time `project.yml`
changes.

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

APNs push is not delivered on the simulator; the app still builds and runs, and
you can exercise the web view and onboarding there.

## Run on a device

1. `cd ios && xcodegen generate && open Nero.xcodeproj`
2. Select the `Nero` target → Signing & Capabilities.
3. Set your Apple **Team**. Xcode will manage a provisioning profile for
   bundle id `com.pompeii.nero`. The Push Notifications capability is provided
   by `Nero.entitlements` (`aps-environment`); make sure the App ID has the
   Push Notifications capability enabled in the Apple Developer portal.
4. Pick your device and Run.
5. On first launch, enter your Nero server URL and tap **Connect**. Change it
   later via the gear button in the top-right of the web view.

## Push notifications

On launch the app requests notification authorization and registers with APNs.
When the token arrives it is POSTed to your Nero backend:

```
POST {serverURL}/v1/push/register
content-type: application/json

{ "token": "<hex device token>", "platform": "ios", "bundle_id": "com.pompeii.nero" }
```

Registration is fire-and-forget (failures are logged, they don't block the UI)
and re-runs on every launch once the token arrives and whenever the server URL
changes.

Notification payloads may include a `url` (or `URL`) field; tapping the
notification navigates the web view to that URL.

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
