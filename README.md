<p align="center">
  <strong>Your self-hosted AI that actually knows what's going on.</strong>
</p>

<p align="center">
  <a href="https://github.com/pompeii-labs/nero-oss/releases"><img src="https://img.shields.io/github/v/release/pompeii-labs/nero-oss" alt="Release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License" /></a>
  <a href="https://github.com/pompeii-labs/nero-oss/stargazers"><img src="https://img.shields.io/github/stars/pompeii-labs/nero-oss" alt="Stars" /></a>
</p>

---

Nero is an open source AI companion that runs on your machine, connects to your tools via MCP, and thinks in the background while you're away. Talk to it through the terminal, web dashboard, voice calls, or SMS.

**Why Nero?**
- **Self-hosted** - Your data stays on your machine. No cloud dependency.
- **Multi-interface** - CLI, web UI, voice, and SMS. Use what fits the moment.
- **Proactive** - Background thinking monitors your projects and surfaces insights.
- **MCP-native** - First-class Model Context Protocol support. Add any MCP server in seconds.

<p align="center">
  <img src="assets/screenshot.png" alt="Nero Web UI" width="800" />
</p>

## Install

```bash
# Install CLI
curl -fsSL https://raw.githubusercontent.com/pompeii-labs/nero-oss/main/install.sh | bash

# Create env file with your API key
mkdir -p ~/.nero
echo "OPENROUTER_API_KEY=your_key" > ~/.nero/.env

# Setup and start Docker
nero setup --compose
```

That's it. Nero is running at `http://localhost:4848`.

## Installation Modes

Nero supports two installation modes that control how much access it has to your host system:

### Integrated Mode (Default)

Full access to your host system. Use this for maximum capability.

```bash
nero setup --compose --integrated
```

| Capability | Description |
|------------|-------------|
| Host Filesystem | Read/write access to `~/` via `/host/home` |
| Docker | Can run docker commands on your host |
| Network | Uses host network for localhost access |

### Contained Mode

Sandboxed with no host access. Use this for untrusted tasks or demos.

```bash
nero setup --compose --contained
```

| Capability | Description |
|------------|-------------|
| Filesystem | Container-only, isolated volume |
| Docker | No access |
| Network | Isolated, port-mapped |

### Switching Modes

Re-run setup with the desired mode flag:

```bash
nero setup --compose --contained   # Switch to contained
nero setup --compose --integrated  # Switch to integrated
```

### Check Current Mode

```bash
nero status
```

## Update

```bash
nero update
```

This pulls the latest Docker image, restarts the container, and updates the CLI binary.

## Development

```bash
bun install
cp .env.example .env
# Edit .env with your OPENROUTER_API_KEY

# Optional: Start PostgreSQL
docker compose up db -d
bun run db:migrate

# Terminal 1: Service
bun run dev:service

# Terminal 2: CLI
bun run dev
```

## Configuration

Config lives at `~/.nero/config.json`. Add MCP servers:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/home/user"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "your-token"
      }
    }
  }
}
```

Or use the CLI:

```bash
nero mcp add filesystem -- npx -y @modelcontextprotocol/server-filesystem ~/
nero mcp add github -- npx -y @modelcontextprotocol/server-github
nero mcp add remote-server https://mcp.example.com --transport http
nero mcp list
nero mcp remove filesystem
```

## User Instructions (NERO.md)

Create `~/.nero/NERO.md` to customize Nero's behavior with persistent instructions:

```bash
echo "Always be concise. Prefer TypeScript over JavaScript." > ~/.nero/NERO.md
```

The file is loaded on startup and reloaded with `nero reload`. Use it for:

- Code style preferences
- Project context
- Response formatting rules
- Any persistent instructions

## CLI Commands

```bash
nero                      # Start interactive REPL
nero -m "message"         # One-shot message
nero config               # Show current configuration
nero status               # Show installation status and mode
nero setup                # Setup Docker container
nero setup --integrated   # Setup with full host access (default)
nero setup --contained    # Setup sandboxed, no host access
nero update               # Update to latest version
nero update --check       # Check for updates
nero reload               # Reload MCP servers and NERO.md
nero restart              # Restart the service container
nero migrate              # Run database migrations
```

## Slash Commands (REPL)

| Command | Description |
|---------|-------------|
| `/help` | Show available commands |
| `/exit` | Exit the REPL |
| `/clear` | Clear conversation history |
| `/compact` | Summarize and compress context |
| `/model` | Switch AI model |
| `/mcp` | List connected MCP servers and tools |
| `/memory` | Show stored memories |
| `/usage` | Show context usage |
| `/think` | Run background thinking manually |

## Background Thinking

Nero can think in the background while you're away.

```bash
nero think on              # Enable
nero think off             # Disable
nero think status          # Show settings
nero think notify on       # Enable urgent notifications
nero think destructive on  # Allow destructive actions (off by default)
nero think protect dev     # Add branch to protected list
```

When enabled, Nero waits 5 minutes after your last message, then checks git status, logs, MCP tools, etc. every 10 minutes. Thoughts are surfaced when you return.

## Environment Variables

Add these to `~/.nero/.env`:

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENROUTER_API_KEY` | Yes | OpenRouter API key |
| `DATABASE_URL` | No | PostgreSQL connection string |
| `TAVILY_API_KEY` | No | For web search tool |
| `DEEPGRAM_API_KEY` | No | For voice STT |
| `ELEVENLABS_API_KEY` | No | For voice TTS |
| `NERO_LICENSE_KEY` | No | For voice/SMS webhook routing |

## Voice, SMS & Slack (Optional)

Nero works fully without a license. The CLI, chat, and MCP tools all work out of the box.

A license unlocks voice calls, SMS, and Slack integration by routing webhooks through our infrastructure.

```bash
# Add to ~/.nero/.env
NERO_LICENSE_KEY=your_license_key
DEEPGRAM_API_KEY=your_key
ELEVENLABS_API_KEY=your_key

# Install cloudflared
brew install cloudflared

# Start tunnel
nero tunnel -d

# Register
nero license register
nero license status
```

Once registered, you can receive calls and texts at the phone number provided with your license.

## License

MIT
