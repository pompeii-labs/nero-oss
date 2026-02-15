# Changelog

All notable changes to Nero are documented here.

## 1.27.1 (2026-02-15)

### Fixes

- Auto-reconnect emotion detection WebSocket when Hume's inactivity timeout fires
- Add TTS fallback config (`ttsFallback`) so if the primary provider fails, text is retried with the fallback

## 1.27.0 (2026-02-14)

### New Features

**Service Logs**
- In-memory circular buffer (last 1000 entries) and file logging to `~/.nero/logs/nero.log`
- REST endpoint `GET /api/logs` with `?lines=`, `?level=`, `?source=` query params
- SSE streaming endpoint `GET /api/logs/stream` for real-time log tailing
- `nero logs` CLI command to view recent logs from terminal
- `nero logs -f` for follow mode (real-time streaming)
- `nero logs -n 200 -l ERROR` for filtered queries
- New Logs tab in web dashboard with live streaming, level filter chips, auto-scroll, and pause/resume

## 1.26.2 (2026-02-15)

### New Features

**Emotion Detection**
- Real-time vocal emotion detection during voice calls via Hume Expression Measurement API
- Runs in parallel with Deepgram STT on the same audio stream (48 prosody dimensions)
- Top emotions passed to LLM via `<caller_emotion>` tags so responses adapt to caller's tone
- Auto-mutes during TTS playback to prevent analyzing Nero's own voice
- Opt-in via `emotionDetection: true` in voice config or `NERO_EMOTION_DETECTION=true` env var
- Requires `HUME_API_KEY` (same key used for Hume TTS)

### Changes
- Upgrade `@pompeii-labs/audio` to 0.3.1 (adds `onNormalizedAudio` hook for audio pipeline taps)
- Add `hume` SDK as direct dependency for Expression Measurement streaming

## 1.26.1 (2026-02-14)

### Fixes
- Fix release CI: use native arm64 runners instead of QEMU emulation for Docker builds

## 1.26.0 (2026-02-14)

### New Features

**Autonomy Mode**
- Nero can now run a continuous self-directed loop, working on his own projects between user interactions
- Self-scheduling wake/sleep cycle with variable durations chosen by Nero (clamped to configurable bounds)
- Persistent project tracking (`autonomy_projects` table) with progress notes, priorities, and next steps
- Session journal (`autonomy_journal` table) for continuity across sessions
- Four new autonomy tools: `createAutonomyProject`, `updateAutonomyProject`, `writeJournalEntry`, `listAutonomyProjects`
- Token usage tracking per session via `onUsageUpdate` (input/output tracked separately)
- Autonomy context surfaces in reactive mode so Nero can reference his autonomous work in conversation

**Safety Guardrails**
- Configurable daily token budget (set to 0 for unlimited)
- Max sessions per day limit (set to 0 for unlimited)
- Per-session time cap (default 30 minutes)
- Destructive action blocking with separate config from thinking mode
- Protected branch enforcement
- Yields to user when agent is busy

**CLI Commands**
- `nero autonomy on/off` - enable/disable (auto-disables thinking mode)
- `nero autonomy status` - show config and current state
- `nero autonomy budget <tokens>` - set daily token budget (0 for unlimited)
- `nero autonomy destructive on/off` - toggle destructive actions
- `nero autonomy sleep <min> <max>` - set sleep range in minutes
- `nero autonomy notify on/off` - toggle notifications

**Environment Variables**
- `NERO_AUTONOMY_ENABLED` - enable autonomy mode
- `NERO_AUTONOMY_TOKEN_BUDGET` - set daily token budget

## 1.25.1 (2026-02-14)

### Fixes
- Flatten browser tool args so smaller models (Haiku 4.5, Kimi) can call it correctly

## 1.25.0 (2026-02-13)

### New Features

**Hooks System**
- Run shell commands at key lifecycle points (before/after tool use, on prompts, on responses, on errors, on session start)
- `PreToolUse` hooks can block tool execution (non-zero exit code = block, stdout = reason)
- Regex matching to target specific tools or mediums
- Configurable timeout per hook (default 10s)
- Configure via `hooks` key in `~/.nero/config.json`

## 1.24.0 (2026-02-13)

### New Features
- Subagent dispatch for parallel task execution

## 1.23.1 (2026-02-12)

### New Features
- Local model support (Ollama, vLLM, any OpenAI-compatible endpoint)

## 1.23.0 (2026-02-12)

### New Features
- Image and file support across all interfaces

## 1.22.4 (2026-02-12)

### Fixes
- Reduce redundant checks in proactivity background loop

## 1.22.3 (2026-02-12)

### Fixes
- Use relative URLs in web dashboard for LAN access

## 1.22.2 (2026-02-11)

### Fixes
- Reset sequences after import, increase body limits for large payloads
- Increase json body limit to 50mb for large imports

## 1.22.1 (2026-02-11)

### Fixes
- Prevent browser image from claiming latest tag

## 1.22.0 (2026-02-11)

### New Features
- Browser automation with Playwright

## 1.21.1 (2026-02-11)

### New Features
- `--dangerous` mode for auto-approving tool actions

## 1.21.0 (2026-02-11)

### New Features
- Scheduled actions engine with recurrence, execution, and API

## 1.20.0 (2026-02-11)

### New Features
- Export/import state via .nro files
- Background activity log, prompt rework, structured output
- Web MCP OAuth flow for HTTP servers

## 1.19.1 (2026-02-09)

### Changes
- Redesign web app with TW4, shadcn v2, Svelte 5 runes, oklch color space

## 1.19.0 (2026-02-09)

### New Features
- Env var overrides for all config values
- Permission focus notifications
- Terminal cursor focus improvements

## 1.18.0 (2026-02-09)

### New Features
- Fetch model context limit from OpenRouter API
- Parallelize MCP loading and configurable thinking interval

### Fixes
- Medium label contrast on user bubbles in light mode

## 1.17.0 (2026-02-09)

### New Features
- Relay-only port architecture with local IP bypass

## 1.16.1 (2026-02-06)

### Fixes
- Integration tests running in CI

## 1.16.0 (2026-02-06)

### New Features
- Relay security hardening, voice fixes, and CLI refactor

## 1.15.2 (2026-02-01)

### Fixes
- Include full file content in update activity for diff viewer

## 1.15.1 (2026-02-01)

### Fixes
- Start background thinking timer on service start

## 1.15.0 (2026-02-01)

### Fixes
- iOS: Tool activities now appear in timeline order instead of fixed section above input

### Changes
- Nero can now reference background activity when asked what he's been up to

## 1.14.0 (2026-01-31)

### New Features

**Native iOS App**
- Full-featured iOS companion app built with SwiftUI
- Chat interface with markdown rendering and streaming responses
- Voice mode with real-time audio and echo cancellation
- Memories management (view, add, delete)
- Settings with connection status, context usage, and server info
- Connect via local network or remote tunnel with license key
- Hamburger menu navigation

**Skills Support**
- Skills are reusable prompts that extend Nero's capabilities
- Compatible with the skills.sh ecosystem
- CLI commands: `nero skills list/add/create/remove`
- REPL/web: `/<skill-name>` to toggle skills on/off
- Skills appear in command palette suggestions
- `/skills` command shows loaded status
- `/reload` refreshes skills along with MCP config
- Support installing skills from git repos

## 1.13.0 (2026-01-30)

### Changes
- Add `cd` tool for changing directories
- Write tool auto-creates parent directories
- Clearer git repository context in system prompts

### Fixes
- Suppress git stderr output when not in a git repository

## 1.12.2 (2026-01-30)

### Fixes
- Fix crash when background process errors occur without listeners

### Docs
- Add hero section and screenshot to README

## 1.12.1 (2026-01-30)

### Fixes
- Fix database connection race condition in docker-compose setup

## 1.12.0 (2026-01-30)

### Changes
- Add `updateFile` tool for surgical file edits (find/replace instead of full rewrite)
- Add diff viewer for file changes in permission modal and activity timeline
- Collapsible sidebar with persistent state

## 1.11.1 (2026-01-30)

### Fixes
- Fix /context showing inaccurate token counts (now includes system prompts, tools, all message types)

## 1.11.0 (2026-01-30)

### Changes
- Add timezone configuration with auto-detect and `/timezone` command
- Add abort/interrupt controls: Stop button, `/abort` command, Ctrl+C, Escape
- Prevent background thinking from running while actively processing
- Add open source community files (LICENSE, CONTRIBUTING, CHANGELOG)

## 1.10.0 (2026-01-30)

### Changes
- Add process manager for background commands (docker logs -f, tail -f, etc.)
- Unified tool activity logging across all modes
- Add displayName field for human-readable tool names in UI

## 1.9.0 (2026-01-30)

### Changes
- Session-based memory system with automatic summarization
- Core vs contextual memory classification
- Cross-platform Docker socket support (macOS/Linux)

## 1.8.18 (2026-01-29)

### Changes
- Add Docker CLI and compose to container image

## 1.8.17 (2026-01-29)

### Fixes
- Set GIT_DISCOVERY_ACROSS_FILESYSTEM in bash tool for Docker

## 1.8.16 (2026-01-29)

### Changes
- Add NERO.md support for persistent user instructions
- Add `nero restart` command
- Fix `nero reload` command

## 1.8.15 (2026-01-29)

### Changes
- Refactor: extract models and docker modules

## 1.8.14 (2026-01-29)

### Changes
- Add integrated/contained installation modes for host access control

## 1.8.13 (2026-01-29)

### Fixes
- `nero update` now installs to correct binary location

## 1.8.12 (2026-01-29)

### Fixes
- MCP path translation for Docker
- Improved OAuth discovery

## 1.8.11 (2026-01-29)

### Fixes
- Improve color contrast for light mode across components

## 1.8.10 (2026-01-29)

### Fixes
- Enable git discovery across filesystem boundary in Docker
- Use correct config path for env file in Docker mode

## 1.8.9 (2026-01-29)

### Fixes
- Namespace API routes under /api/ to fix SPA routing

## 1.8.8 (2026-01-29)

### Fixes
- Clearer instructions in prompt for git operations

## 1.8.7 (2026-01-29)

### Changes
- Simplify installation with `nero setup` command

## 1.8.6 (2026-01-29)

### Changes
- Improve Docker environment handling
- Force ~/.nero config path

## 1.8.5 (2026-01-29)

### Fixes
- Add git, curl, procps to Docker image for shell tools

## 1.8.4 (2026-01-29)

### Changes
- Update favicon for web dashboard
- Add `nero license` command to open license page in browser

## 1.8.3 (2026-01-29)

### Changes
- Show connection error when Nero service is down

## 1.8.2 (2026-01-29)

### Changes
- Add `note_for_user` tool for proactive insights

## 1.8.1 (2026-01-29)

### Changes
- Granular bash permissions with pattern matching

## 1.8.0 (2026-01-29)

### Changes
- Background thinking with destructive action protection

## 1.7.2 (2026-01-28)

### Fixes
- Bash commands now work on host filesystem in Docker mode

## 1.7.1 (2026-01-28)

### Fixes
- Prevent duplicate Slack webhook processing
