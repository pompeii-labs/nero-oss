# Nero

Open source AI companion with terminal, voice, and SMS interfaces.

## Install

**Docker Compose** (recommended - includes Postgres):
```bash
curl -fsSL https://raw.githubusercontent.com/pompeii-labs/nero-oss/main/deploy/compose.sh | bash
nero
```

**Standalone Docker** (no database, or bring your own):
```bash
curl -fsSL https://raw.githubusercontent.com/pompeii-labs/nero-oss/main/deploy/docker.sh | bash
nero
```

Both scripts install the service and the `nero` CLI binary.

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

## Deploy

Nero can run anywhere Docker runs. The service just needs `OPENROUTER_API_KEY` and optionally `DATABASE_URL` for persistence.

<details>
<summary>Standalone Docker</summary>

```bash
docker run -d \
  --name nero \
  -p 4848:4848 \
  -e OPENROUTER_API_KEY=your_key \
  -e DATABASE_URL=postgresql://user:pass@host:5432/nero \
  ghcr.io/pompeii-labs/nero-oss:latest
```

Without `DATABASE_URL`, Nero runs in-memory (no persistence across restarts).
</details>

<details>
<summary>DigitalOcean App Platform</summary>

1. Create a new App from GitHub repo or use the image `ghcr.io/pompeii-labs/nero-oss:latest`
2. Set environment variables:
   - `OPENROUTER_API_KEY` - your OpenRouter key
   - `DATABASE_URL` - use a DO Managed Database or external Postgres
3. Set HTTP port to `4848`
4. Deploy

Connect your local CLI:
```bash
export NERO_SERVICE_URL=https://your-app.ondigitalocean.app
nero
```
</details>

<details>
<summary>Railway</summary>

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/nero)

Or manually:
1. New Project > Deploy from GitHub repo
2. Add a PostgreSQL database
3. Set `OPENROUTER_API_KEY` in variables
4. Railway auto-detects the Dockerfile
</details>

<details>
<summary>Render</summary>

1. New Web Service > Connect your repo
2. Environment: Docker
3. Add environment variables:
   - `OPENROUTER_API_KEY`
   - `DATABASE_URL` (create a Render PostgreSQL or use external)
4. Deploy
</details>

<details>
<summary>Supabase (Database Only)</summary>

Use Supabase as your PostgreSQL provider with any hosting option:

1. Create a Supabase project
2. Go to Settings > Database > Connection string
3. Copy the URI and use as `DATABASE_URL`:

```bash
docker run -d \
  -p 4848:4848 \
  -e OPENROUTER_API_KEY=your_key \
  -e DATABASE_URL="postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres" \
  ghcr.io/pompeii-labs/nero-oss:latest
```
</details>

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

## CLI Commands

```bash
nero                      # Start interactive REPL
nero -m "message"         # One-shot message (no REPL)
nero -v, --version        # Show version
nero config               # Show current configuration
nero update               # Update to latest version
nero update --check       # Check for updates without installing
nero reload               # Reload MCP servers without restart
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
| `/usage` | Show API usage stats |
| `/install-slack` | Connect Nero to Slack (requires license) |

## MCP Servers

Nero supports any MCP-compatible server. Add them via CLI:

```bash
# Stdio transport (local processes)
nero mcp add filesystem -- npx -y @modelcontextprotocol/server-filesystem ~/
nero mcp add github -- npx -y @modelcontextprotocol/server-github

# HTTP transport (remote servers)
nero mcp add remote-server https://mcp.example.com --transport http

# With environment variables
nero mcp add github -- npx -y @modelcontextprotocol/server-github -e GITHUB_TOKEN=xxx

# Management
nero mcp list
nero mcp remove filesystem
nero mcp status              # Check auth status of all servers
```

**OAuth for HTTP MCP servers:**

```bash
nero mcp auth <server-name>  # Start OAuth flow in browser
nero mcp logout <server-name> # Remove stored credentials
nero mcp status <server-name> # Check auth status
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
| `NERO_SERVICE_URL` | No | Service URL for CLI (default: `http://localhost:4848`) |
| `BACKEND_URL` | No | Backend API URL for license/webhook routing (default: `https://api.magmadeploy.com`) |
| `TAVILY_API_KEY` | No | For web search tool |
| `DEEPGRAM_API_KEY` | No | For voice STT |
| `ELEVENLABS_API_KEY` | No | For voice TTS |
| `NERO_LICENSE_KEY` | No | For voice/SMS webhook routing |

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

## Voice, SMS & Slack (Optional)

**Nero works fully without a license.** The CLI, chat, and MCP tools all work out of the box for local development.

A license unlocks voice calls, SMS, and Slack integration by routing webhooks through our infrastructure (so you don't need your own Twilio credentials).

> **Want voice/SMS/Slack?** Email **founders@pompeiilabs.com** to request a license.

### Quick Start

```bash
# 1. Install cloudflared (for tunneling)
brew install cloudflared

# 2. Add keys to your environment
export NERO_LICENSE_KEY=your_license_key
export DEEPGRAM_API_KEY=your_key      # For voice STT
export ELEVENLABS_API_KEY=your_key    # For voice TTS

# 3. Start Nero service
docker-compose up -d

# 4. Start tunnel (in a separate terminal or use -d for background)
nero tunnel -d

# 5. Register your tunnel with your license
nero license register

# 6. Check status
nero license status
```

Once registered, you can receive calls and texts at the phone number provided with your license.

### Commands Reference

**Tunnel:**
```bash
nero tunnel              # Start tunnel (foreground)
nero tunnel -d           # Start tunnel in background (daemon)
nero tunnel status       # Check tunnel status
nero tunnel stop         # Stop background tunnel
```

**License:**
```bash
nero license register              # Auto-detects running tunnel
nero license register --url https://your-tunnel.com
nero license status                # Check license and tunnel status
```

### Slack

Connect Nero to Slack (requires license):

```bash
/install-slack   # In the REPL, opens browser for OAuth
```

Once connected, DM Nero in Slack and it joins the same conversation as CLI, voice, and SMS.

Nero can also proactively message you on Slack, SMS, or initiate voice calls when configured with a license.

## Security

Nero is designed with security as a priority, addressing vulnerabilities found in similar tools:

### vs Molt/Clawdbot

| Concern | Molt | Nero |
|---------|------|------|
| **Execution environment** | Direct host access, no sandboxing | Docker container with mounted volumes |
| **Webhook exposure** | User exposes gateway directly to internet | Webhooks route through Pompeii (authenticated) |
| **Secret storage** | Plaintext in ~/.clawdbot/*.json | Environment variables only |
| **Plugin ecosystem** | ClawdHub with no vetting/signing | User-configured MCP servers only |
| **Authentication** | Optional, often misconfigured | License key required for remote access |
| **API key exposure** | Stored in markdown files, targeted by infostealers | Never stored on disk |

### How Nero Protects You

- **Containerized execution**: File operations happen in a Docker container with explicit volume mounts
- **Authenticated webhooks**: All SMS/Voice/Slack webhooks route through Pompeii's infrastructure with license key validation
- **No credential storage**: API keys are environment variables, never written to disk
- **No untrusted plugins**: MCP servers are explicitly configured by you, not downloaded from a marketplace
- **Secure by default**: Remote access requires license key authentication

## License

MIT
