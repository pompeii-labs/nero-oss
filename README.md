# Nero

Open source AI companion with terminal, voice, and SMS interfaces.

## Install

```bash
# Install CLI
curl -fsSL https://raw.githubusercontent.com/pompeii-labs/nero-oss/main/install.sh | bash

# Create env file with your API key
mkdir -p ~/.nero
echo "OPENROUTER_API_KEY=your_key" > ~/.nero/.env

# Setup and start Docker
nero setup
```

That's it. Nero is running at `http://localhost:4848`.

**With Postgres** (recommended for persistence):

```bash
nero setup --compose
```

This creates a docker-compose.yml with Nero + Postgres.

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

## CLI Commands

```bash
nero                      # Start interactive REPL
nero -m "message"         # One-shot message
nero config               # Show current configuration
nero setup                # Setup Docker container
nero update               # Update to latest version
nero update --check       # Check for updates
nero reload               # Reload MCP servers
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
