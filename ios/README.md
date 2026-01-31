# Nero iOS App

Native iOS app for OpenNero with full feature parity to the web app.

## Features

- **Chat**: Send messages with SSE streaming support
- **Voice**: Real-time voice conversations via WebSocket
- **Memories**: View and manage Nero's memories
- **Settings**: Configure connection, view context usage, manage MCP tools

## Requirements

- iOS 17.0+
- Xcode 15.0+

## Setup

### Connection Modes

**Local Network**
1. Ensure your iOS device is on the same network as your Nero server
2. Enter the server URL (e.g., `http://192.168.1.100:4848`)
3. Tap Connect

**Remote (Tunnel)**
1. Enter your Pompeii license key
2. The app will automatically resolve the tunnel URL
3. Tap Connect

## Development

1. Open `ios/Nero.xcodeproj` in Xcode
2. Select your development team in Signing & Capabilities
3. Build and run on simulator or device

## Architecture

```
Nero/
├── NeroApp.swift              # App entry point
├── ContentView.swift          # Auth/setup guard
│
├── View/
│   ├── MainTabView.swift      # Tab container
│   ├── SetupView.swift        # Server URL + license key input
│   ├── ChatView.swift         # Main chat interface
│   ├── VoiceView.swift        # Full-screen voice mode
│   ├── MemoriesView.swift     # Memory list/management
│   ├── SettingsView.swift     # Config + info
│   └── Components/
│       ├── MessageBubble.swift
│       ├── ToolActivityView.swift
│       ├── PermissionModal.swift
│       └── VoiceRings.swift
│
├── ViewModel/
│   ├── ChatViewModel.swift    # Chat state + streaming
│   └── VoiceViewModel.swift   # Voice connection state
│
├── Manager/
│   ├── NeroManager.swift      # Server config persistence
│   ├── APIManager.swift       # HTTP + SSE client
│   ├── VoiceManager.swift     # WebSocket + audio
│   └── ToastManager.swift     # Notifications
│
├── Model/
│   ├── Message.swift          # Chat message
│   ├── ToolActivity.swift     # Tool execution state
│   ├── Memory.swift           # Memory item
│   └── ServerInfo.swift       # Health response
│
└── Extension/
    ├── Color+Nero.swift       # Nero color palette
    └── View+Modifiers.swift   # Custom modifiers
```

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Connection check |
| `/api/chat` | POST | Chat with SSE streaming |
| `/api/history` | GET | Load chat history |
| `/api/memories` | GET | Get memories |
| `/api/context` | GET | Token usage |
| `/api/permission/:id` | POST | Approve/deny tool |
| `/api/compact` | POST | Compact context |
| `/api/abort` | POST | Cancel current request |
| `/api/reload` | POST | Reload MCP config |
| `/webhook/voice/stream` | WS | Voice WebSocket |

All requests include `x-license-key` header when using tunnel connection.

## Permissions

- **Microphone**: Required for voice conversations
- **Local Network**: Required to connect to Nero on your local network
