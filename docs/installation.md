# Installation Guide

This guide covers installing Nero OSS using various methods depending on your needs.

## Prerequisites

- **Bun** (recommended) or **Node.js 18+** with npm
- **PostgreSQL 14+** with pgvector extension (optional, for persistence)
- **Git** for cloning the repository

## Quick Start

### Option 1: Binary Install (Recommended for Users)

The fastest way to get Nero running:

```bash
curl -fsSL https://raw.githubusercontent.com/pompeii-labs/nero-oss/main/install.sh | bash
```

This will:
1. Download the latest binary for your platform
2. Install to `~/.local/bin/`
3. Add to your PATH if needed
4. Run the interactive setup

**Supported platforms:** Linux x64/arm64, macOS x64/arm64

### Option 2: Install from Source (Recommended for Developers)

For development or customization:

```bash
# Clone the repository
git clone https://github.com/pompeii-labs/nero-oss.git
cd nero-oss

# Install dependencies
bun install

# Set up the database (optional but recommended)
bun run cli setup

# Build the TypeScript
bun run build

# Run Nero
bun run cli chat
```

### Option 3: Docker Compose (Recommended for Self-Hosting)

For running Nero as a persistent service:

```bash
# Clone the repository
git clone https://github.com/pompeii-labs/nero-oss.git
cd nero-oss

# Create environment file
cp .env.example .env
# Edit .env with your API keys

# Start with Docker Compose
docker-compose up -d

# View logs
docker-compose logs -f nero
```

## Configuration

### Environment Variables

Create `.env` in your project directory or `~/.nero/.env`:

```env
# Required - Get from openrouter.ai
OPENROUTER_API_KEY=your_openrouter_api_key

# Optional - PostgreSQL connection (defaults to in-memory)
DATABASE_URL=postgresql://user:password@localhost:5432/nero

# Optional - Voice features (requires license)
ELEVENLABS_API_KEY=your_elevenlabs_key
NERO_LICENSE_KEY=your_pompeii_license

# Optional - Additional services
TAVILY_API_KEY=your_tavily_key      # Web search
DEEPGRAM_API_KEY=your_deepgram_key  # Speech-to-text
```

### Interactive Setup

Run the setup wizard to configure Nero:

```bash
nero setup
```

This will:
- Prompt for API keys
- Configure the database connection
- Set default preferences
- Test connectivity

### Manual Configuration

Edit `~/.nero/config.json` directly:

```json
{
  "model": "anthropic/claude-3.5-sonnet",
  "session": {
    "enabled": true,
    "gapThresholdMinutes": 30,
    "autoSummarize": true
  },
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/"]
    }
  }
}
```

## Database Setup

### Option A: Docker (Recommended)

```bash
docker run -d \
  --name nero-db \
  -e POSTGRES_USER=nero \
  -e POSTGRES_PASSWORD=nero \
  -e POSTGRES_DB=nero \
  -p 5432:5432 \
  -v nero-data:/var/lib/postgresql/data \
  pgvector/pgvector:pg16
```

### Option B: Local PostgreSQL

```bash
# macOS with Homebrew
brew install postgresql@16
brew install pgvector

# Start PostgreSQL
brew services start postgresql@16

# Create database
psql postgres -c "CREATE USER nero WITH PASSWORD 'nero';"
psql postgres -c "CREATE DATABASE nero OWNER nero;"
psql nero -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

### Option C: Cloud PostgreSQL

Nero works with any PostgreSQL 14+ with pgvector:
- **Supabase**: Enable the pgvector extension
- **Neon**: Supports pgvector by default
- **AWS RDS**: Install pgvector extension

Set the connection string:

```env
DATABASE_URL=postgresql://user:password@host:5432/database
```

## MCP Server Configuration

MCP servers provide tool capabilities. Configure them in `~/.nero/mcp.json`:

```json
{
  "filesystem": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "/home/user"]
  },
  "github": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-github"],
    "env": {
      "GITHUB_TOKEN": "your_token"
    }
  },
  "fetch": {
    "command": "uvx",
    "args": ["mcp-server-fetch"]
  }
}
```

### Adding Servers

```bash
# Add a filesystem server
nero mcp add filesystem -- npx -y @modelcontextprotocol/server-filesystem ~

# Add with environment variables
nero mcp add github -- npx -y @modelcontextprotocol/server-github -e GITHUB_TOKEN=xxx

# Add HTTP/SSE server
nero mcp add remote-api https://mcp.example.com --transport http
```

### Listing Servers

```bash
nero mcp list
```

## Post-Installation

### Verify Installation

```bash
# Check version
nero --version

# Test chat mode
nero chat

# Run diagnostics
nero setup --check
```

### First-Time Setup

1. **Configure your preferred model:**
   ```bash
   nero config set model anthropic/claude-3.5-sonnet
   ```

2. **Add your first MCP server:**
   ```bash
   nero mcp add filesystem -- npx -y @modelcontextprotocol/server-filesystem ~
   ```

3. **Test tool access:**
   ```bash
   nero chat
   # Try: "List files in my home directory"
   ```

## Updating

### Binary Install

```bash
nero upgrade
```

### Source Install

```bash
git pull
bun install
bun run build
```

### Docker

```bash
docker-compose pull
docker-compose up -d
```

## Troubleshooting

### "Cannot find module"

If using source install, ensure dependencies are installed:
```bash
bun install
```

### Database connection errors

1. Verify PostgreSQL is running:
   ```bash
   pg_isready -h localhost -p 5432
   ```

2. Check your `DATABASE_URL` format:
   ```
   postgresql://user:password@host:port/database
   ```

3. Ensure pgvector extension is created:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```

### MCP server fails to connect

1. Check server is properly configured:
   ```bash
   nero mcp list
   ```

2. Test the server command manually

3. Check logs:
   ```bash
   nero logs
   ```

### Permission denied errors

Ensure Nero has appropriate permissions:
- File access: Grant read/write to working directories
- Docker: Add user to docker group (if using Docker MCP servers)
- Network: Allow outbound HTTPS for API calls

## Uninstallation

### Binary

```bash
rm ~/.local/bin/nero
rm -rf ~/.nero
```

### Source

```bash
rm -rf /path/to/nero-oss
rm -rf ~/.nero
```

### Docker

```bash
docker-compose down -v
rm -rf /path/to/nero-oss
```

## Next Steps

- Read the [Architecture Overview](architecture.md) to understand Nero's design
- Explore [Features](features.md) to see what Nero can do
- Check out [Example Skills](../examples/skills/) for inspiration
- Join the community on [GitHub Discussions](https://github.com/pompeii-labs/nero-oss/discussions)
