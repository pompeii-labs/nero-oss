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
| `NERO_SERVICE_URL` | No | Service URL for CLI (default: `http://localhost:4848`) |
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
