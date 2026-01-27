# Nero

Open source AI companion with terminal, voice, and SMS interfaces.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/pompeii-labs/nero-oss/main/install.sh | bash
```

This installs the Nero CLI and starts the service in Docker. Requires Docker and will install [bun](https://bun.sh) if needed.

Then just run:
```bash
nero
```

## Manual Setup

<details>
<summary>Docker Compose</summary>

```bash
git clone https://github.com/pompeii-labs/nero-oss.git
cd nero-oss
cp .env.example .env
# Edit .env with your OPENROUTER_API_KEY

docker-compose up -d
bun install -g github:pompeii-labs/nero-oss
nero
```
</details>

<details>
<summary>Local Development</summary>

```bash
bun install
cp .env.example .env
# Edit .env with your OPENROUTER_API_KEY

# Optional: Start PostgreSQL
docker-compose up db -d
bun run db:migrate

# Terminal 1: Service
bun run dev:service

# Terminal 2: CLI
bun run dev
```
</details>

### Local Development

```bash
# Install dependencies
bun install

# Set up environment
cp .env.example .env
# Edit .env with your OPENROUTER_API_KEY

# Optional: Start PostgreSQL for persistence
docker-compose up db -d
bun run db:migrate

# Start the service
bun run dev:service

# In another terminal, start the CLI
bun run dev
```

## Configuration

Create `~/.nero/config.json` to configure MCP servers:

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

## Slash Commands

| Command | Description |
|---------|-------------|
| `/help` | Show available commands |
| `/exit` | Exit the REPL |
| `/clear` | Clear conversation history |
| `/compact` | Summarize and compress context |
| `/model` | Switch AI model |
| `/mcp` | List connected MCP servers and tools |
| `/memory` | Show stored memories |
| `/usage` | Show API usage stats |

## MCP Servers

Nero supports any MCP-compatible server. Add them via CLI:

```bash
nero mcp add filesystem npx -y @modelcontextprotocol/server-filesystem ~/
nero mcp add github npx -y @modelcontextprotocol/server-github
nero mcp list
nero mcp remove filesystem
```

Popular MCP servers:
- `@modelcontextprotocol/server-filesystem` - File system access
- `@modelcontextprotocol/server-github` - GitHub integration
- `@modelcontextprotocol/server-slack` - Slack integration
- `@modelcontextprotocol/server-google-drive` - Google Drive

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENROUTER_API_KEY` | Yes | OpenRouter API key |
| `DATABASE_URL` | No | PostgreSQL connection string |
| `ELEVENLABS_API_KEY` | No | For voice TTS |
| `NERO_LICENSE_KEY` | No | For voice/SMS via Pompeii |

## Architecture

Nero runs as a service with a CLI client:

```
┌─────────────────────────────────────────────────────────┐
│                   Nero Service (Docker)                 │
├─────────────────────────────────────────────────────────┤
│  HTTP API:                                              │
│  ├─ POST /chat      (SSE streaming)                    │
│  ├─ GET  /health    (status check)                     │
│  ├─ GET  /context   (token usage)                      │
│  ├─ POST /compact   (context compaction)               │
│  └─ POST /reload    (reload MCP servers)               │
├─────────────────────────────────────────────────────────┤
│  Core:                                                  │
│  ├─ Nero Agent (Magma + Claude via OpenRouter)         │
│  ├─ MCP Client (connects to configured servers)        │
│  └─ Memory System (PostgreSQL)                         │
└─────────────────────────────────────────────────────────┘
         │
         │ HTTP/SSE
         ▼
┌─────────────────────────────────────────────────────────┐
│                      Nero CLI                           │
│  Interactive REPL with tool permissions & diff viewer   │
└─────────────────────────────────────────────────────────┘
```

## Voice & SMS

Voice and SMS require a license key from Pompeii Labs for webhook routing.

1. Get a license key from [pompeiilabs.com/nero](https://pompeiilabs.com/nero)
2. Add `NERO_LICENSE_KEY` to your environment
3. Configure voice/SMS in `~/.nero/config.json`

## License

MIT
