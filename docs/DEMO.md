# Nero OSS Demo

This document showcases Nero's capabilities through visual examples. This is the **final blocker** for launch - we need GIFs or short videos demonstrating these key features.

## Required Demo Content

### 1. Autonomous Mode (30s)
**What to capture:**
- User enables autonomy mode: `nero autonomy on`
- Nero schedules a task: "Checking calendar every morning"
- Time passes (cut)
- Nero proactively sends a morning briefing with calendar + weather

**Format:** GIF or 30s video
**File:** `demo-autonomy.gif`

---

### 2. Memory System (15s)
**What to capture:**
- User mentions: "My birthday is June 16"
- Later, user asks: "When's my birthday?"
- Nero responds: "June 16, 2000. You'll be 26 this year."
- Show memory graph visualization: `nero memories --graph`

**Format:** GIF or 15s video
**File:** `demo-memory.gif`

---

### 3. Multi-Interface Sync (20s)
**What to capture:**
- User sends message via web UI
- Same conversation visible in CLI: `nero chat`
- Message appears on voice device (ambient display)
- Show all three interfaces showing same context

**Format:** GIF or 20s video
**File:** `demo-interfaces.gif`

---

### 4. MCP Tool Discovery (20s)
**What to capture:**
- User: "Add Spotify to my tools"
- Nero searches MCP registry, finds server
- `nero mcp add spotify -- npx -y @modelcontextprotocol/server-spotify`
- User: "Play my liked songs"
- Music starts playing

**Format:** GIF or 20s video
**File:** `demo-mcp.gif`

---

### 5. Background Work (25s)
**What to capture:**
- User: "Research MCP servers while I'm in meetings"
- Nero: "Got it. Will check in when you have updates."
- (Time passes - show calendar event)
- Nero sends DM: "Found 12 relevant MCP servers. Here's the summary..."
- Show the background thinking log

**Format:** GIF or 25s video
**File:** `demo-background.gif`

---

## Quick-Start Demo (Single GIF)

**Alternative:** One 60-second GIF showing:

1. Install: `curl -fsSL nero.sh/install.sh | bash`
2. Setup: `nero setup`
3. First chat: "Hi, I'm Matty"
4. Enable autonomy: `nero autonomy on`
5. Schedule task: "Remind me to stand up every hour"
6. Show memory: `nero memories`

**File:** `demo-quickstart.gif`

---

## Technical Requirements

- **Resolution:** 1280x720 minimum
- **Format:** GIF (preferred) or MP4
- **File size:** <10MB per GIF
- **Hosting:** Upload to GitHub, embed here

## Embedding

Once you have the GIFs, update this file:

```markdown
![Autonomy Demo](./assets/demo-autonomy.gif)
*Autonomous scheduling and proactive updates*
```

---

## Status

- [ ] Autonomy demo
- [ ] Memory demo
- [ ] Multi-interface demo
- [ ] MCP demo
- [ ] Background work demo
- [ ] Quick-start demo (optional)

**Last updated:** March 9, 2026

---

## Notes

These demos are the **final blocker** for launch. Everything else is ready:
- ✅ Code committed (14 commits ahead)
- ✅ Documentation complete
- ✅ Validation scripts passing
- ✅ Launch materials ready

Once these GIFs are created and committed to `docs/assets/`, we're ready to run `launch.sh`.
