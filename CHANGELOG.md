# Changelog

All notable changes to Nero are documented here.

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
