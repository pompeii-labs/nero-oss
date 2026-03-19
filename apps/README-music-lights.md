# 🎵 Music-Reactive LIFX Visualizer

> "Every Track Human. Every Light Alive."

Bridge your Spotify playback to LIFX smart lights with **beat-precise synchronization**. Your living room becomes a visualizer that responds to the actual musical structure — beats, bars, sections, and dynamics.

Built for the Pi 5/8GB as part of Matty's homelab journey.

---

## What Makes This Special

### Basic Version (`music-reactive-lights.ts`)
- Polls Spotify every 5 seconds
- Uses simple audio features (energy, tempo, valence)
- Smooth color transitions based on mood
- Good for: ambient background lighting

### **Enhanced Version** (`enhanced-music-visualizer.ts` + `music-visualizer-mcp.ts`)
- **Real-time beat detection** via Spotify Audio Analysis API
- **Precise synchronization** to quarter notes, bars, and song sections
- **Multiple effect modes**: Pulse, Flow, Strobe, Ambient
- **Web dashboard** for real-time control and visualization
- **Keyboard controls** for instant mode switching
- Good for: party mode, showing off, actually impressing people

---

## Quick Start

### 1. Run in Demo Mode (No Spotify Setup Needed)

```bash
cd ~/PROJECTS/nero-oss/apps

# Basic demo
bun run demo-visualizer.ts

# Enhanced visualizer with dashboard (demo mode)
bun run music-visualizer-mcp.ts --demo --dashboard
```

Then open http://localhost:7878 for the control panel.

### 2. Run with Real Spotify + LIFX

```bash
# Set up your credentials first (see below)
bun run music-visualizer-mcp.ts --dashboard
```

Controls while running:
- `p` - Pulse mode (beat-synchronized pulsing)
- `f` - Flow mode (smooth color cycling)
- `s` - Strobe mode (aggressive half-note flashes)
- `a` - Ambient mode (subtle section-based changes)
- `o` - Off (return to cozy)
- `q` - Quit

---

## Setup (Pi 5)

### 1. Install Dependencies

```bash
# On your Pi 5
sudo apt update

# Bun runtime (fast TypeScript)
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc

# Clone this repo
git clone https://github.com/pompeii-labs/nero-oss.git
cd nero-oss/apps

# Install dependencies
bun install
```

### 2. Spotify API Setup

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Create an app
3. Add `http://localhost:8888/callback` as a redirect URI
4. Note your Client ID and Client Secret
5. Get a refresh token (one-time setup):

```bash
# Run the auth helper
bun run spotify-auth.ts

# Follow the OAuth flow
# This saves your refresh token to config.json
```

Required scopes:
- `user-read-currently-playing`
- `user-read-playback-state`

**Note:** Audio Analysis API requires additional approval for some apps. If unavailable, the visualizer falls back to basic features.

### 3. LIFX Setup

1. Get your API token from [cloud.lifx.com](https://cloud.lifx.com)
2. Test your lights:

```bash
# Using the LIFX MCP tool
nero mcp add lifx -- bun run ~/lifx-mcp/dist/index.js
```

### 4. Configuration

Edit `config.json`:

```json
{
  "lifx": {
    "selector": "group:Living Room",
    "api_token": "cxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
  },
  "spotify": {
    "client_id": "your_client_id",
    "client_secret": "your_client_secret",
    "refresh_token": "your_refresh_token"
  },
  "visualizer": {
    "default_mode": "pulse",
    "poll_interval_ms": 5000,
    "update_fps": 20,
    "light_selector": "group:Living Room"
  }
}
```

### 5. Systemd Service (Always-On)

```bash
# Copy service file
sudo cp music-lights.service /etc/systemd/system/
sudo systemctl daemon-reload

# Enable and start
sudo systemctl enable music-lights
sudo systemctl start music-lights

# Check status
sudo systemctl status music-lights
journalctl -u music-lights -f
```

---

## Effect Modes Explained

### Pulse Mode 💓
- **Best for:** Upbeat music, parties, showing off
- **How it works:** Lights pulse on every beat with a sine-wave brightness curve
- **Color logic:** Based on musical key (C=red, G=blue, etc.) + section mood
- **Intensity:** Brightness modulated by track loudness and beat phase

### Flow Mode 🌊
- **Best for:** Long mixes, ambient electronic, background vibes
- **How it works:** Continuous color flow at tempo speed (RPM = BPM)
- **Color logic:** Smooth hue rotation based on track position
- **Intensity:** Consistent moderate brightness

### Strobe Mode ⚡
- **Best for:** Drops, EDM, high energy moments
- **How it works:** Instant flashes on strong beats (every 2 beats)
- **Color logic:** Red on strong beats, yellow on weak beats
- **Intensity:** Maximum brightness, zero transition time

### Ambient Mode 🌙
- **Best for:** Late night listening, studying, conversation
- **How it works:** Slow transitions between section-based color palettes
- **Color logic:** Muted versions of Pulse palettes
- **Intensity:** Low to moderate, 3-second transitions

---

## Web Dashboard

The dashboard (`--dashboard` flag) provides:

- **Now Playing:** Track info with audio features
- **Effect Mode:** One-click mode switching
- **Beat Grid:** Visual representation of beat positions
- **Timeline:** Playback progress with section markers
- **Stats:** Beat count, section count, sync accuracy
- **Light Status:** Real-time brightness/hue/saturation/kelvin display

### Screenshot

```
┌─────────────────────────────────────────┐
│  🎵 Music Visualizer                    │
│  ● Visualizer Active • Connected to LIFX│
├─────────────────────────────────────────┤
│  Now Playing                            │
│  🎧 "Midnight City" by M83              │
│  Energy: 82%  Tempo: 105 BPM            │
├─────────────────────────────────────────┤
│  [💓 Pulse] [🌊 Flow] [⚡ Strobe] ...   │
├─────────────────────────────────────────┤
│  Beat Grid: ██▓░░░██▓░░░██▓░░░██▓░░░   │
└─────────────────────────────────────────┘
```

---

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌──────────────┐
│  Spotify API    │────▶│  BeatSyncEngine  │────▶│  LIFX API    │
│  (Audio Analysis)│     │  (Precise Timing)│     │  (Lights)    │
└─────────────────┘     └──────────────────┘     └──────────────┘
                                │
                                ▼
                       ┌──────────────────┐
                       │  Web Dashboard   │
                       │  (Port 7878)     │
                       └──────────────────┘
```

**Key Components:**

1. **BeatSyncEngine** - Core timing logic using Spotify's beat/bar/section data
2. **Effect Calculators** - One per mode, transforms musical structure → light state
3. **MCP Bridge** - Connects to actual Spotify/LIFX MCP tools
4. **Dashboard Server** - SSE-based real-time web UI

---

## Hardware Notes

**Pi 5/8GB Performance:**
- Spotify API polling: ~50ms every 5s (negligible)
- LIFX API calls: ~100ms, throttled to 20fps max
- Web dashboard: <5% CPU at 20fps SSE updates
- Total memory footprint: ~40MB

**Network Requirements:**
- Spotify API: HTTPS outbound
- LIFX API: HTTPS outbound to cloud.lifx.com
- Dashboard: HTTP on port 7878 (local only)

**Recommended LIFX Setup:**
- 2-4 bulbs in main living area
- Grouped as "Living Room" in LIFX app
- Mix of A19 and BR30 for coverage
- Enable "Music Visualization" scene as fallback

---

## Troubleshooting

### Lights not responding
```bash
# Test LIFX connectivity
lifx list_lights

# Check selector matches your group name exactly
# (case-sensitive: "Living Room" ≠ "living room")
```

### Audio analysis not available
Some Spotify apps don't have Audio Analysis access. The visualizer will:
1. Try to fetch analysis
2. Fall back to basic features if unavailable
3. Log a warning: "Audio analysis unavailable, using basic mode"

### Beat sync feels off
- Check your Pi's system clock (`timedatectl status`)
- Spotify's playback position can drift during buffering
- The visualizer auto-corrects every 5 seconds

### High CPU usage
- Reduce update FPS in config: `"update_fps": 10`
- Disable dashboard if not needed
- Check for zombie Bun processes: `ps aux | grep bun`

---

## Future Enhancements

- [ ] **Local audio analysis** (microphone input for non-Spotify sources)
- [ ] **Multiple zone support** (kitchen, bedroom, office with different modes)
- [ ] **Party mode** (synchronized across all zones)
- [ ] **Green Room integration** (artist-specified lighting profiles)
- [ ] **Morning routine** (gradual wake with curated playlist)
- [ ] **Voice control** ("Nero, set lights to pulse mode")
- [ ] **Beat-matched transitions** (crossfade between tracks)

---

## The Vision

This is a stepping stone to the **Nero Smart Home** product.

Your $250K luxury home installation doesn't just control lights — it *feels* the music. Every track becomes an ambient experience. Every room responds to your mood. The system knows when you're hosting a party vs. having a quiet night in.

The visualizer demonstrates:
- **Real-time API integration** (Spotify + LIFX)
- **Precise timing and synchronization**
- **Multiple interface modes** (CLI, web, autonomous)
- **Extensible effect system**

These are the building blocks of a responsive, intelligent home.

---

## File Reference

| File | Purpose |
|------|---------|
| `music-reactive-lights.ts` | Basic version (features only) |
| `enhanced-music-visualizer.ts` | Core engine with beat detection |
| `music-visualizer-mcp.ts` | MCP-integrated entry point |
| `visualizer-dashboard.ts` | Web dashboard server |
| `demo-visualizer.ts` | Standalone demo (no dependencies) |
| `music-lights.service` | systemd service file |
| `README-music-lights.md` | This file |

---

Built with 💚 for Green Room and the homelab.

*"Every Track Human. Every Light Alive."*
