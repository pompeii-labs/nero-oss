#!/bin/bash
set -e

echo "Installing Nero (Standalone Docker)..."

# Check for Docker
if ! command -v docker &> /dev/null; then
    echo "Error: Docker is required. Install: https://docs.docker.com/get-docker/"
    exit 1
fi

# Create config directory
mkdir -p ~/.nero

# Create default config if missing
if [ ! -f ~/.nero/config.json ]; then
    echo '{"mcpServers":{}}' > ~/.nero/config.json
fi

# Get API key
if [ -z "$OPENROUTER_API_KEY" ]; then
    echo ""
    echo "Get an API key at: https://openrouter.ai/keys"
    read -p "Enter your OpenRouter API key: " OPENROUTER_API_KEY
fi

# Optional DATABASE_URL
if [ -z "$DATABASE_URL" ]; then
    echo ""
    echo "DATABASE_URL not set - running without persistence."
    echo "To add persistence, set DATABASE_URL to a PostgreSQL connection string."
fi

# Run container
docker run -d \
    --name nero \
    --restart unless-stopped \
    -p 4848:4848 \
    -e OPENROUTER_API_KEY="$OPENROUTER_API_KEY" \
    -e DATABASE_URL="$DATABASE_URL" \
    -v ~/.nero/config.json:/root/.nero/config.json:ro \
    ghcr.io/pompeii-labs/nero-oss:latest

echo ""
echo "Nero is running at http://localhost:4848"
echo "Config: ~/.nero/config.json"
echo ""
echo "To use the CLI, install bun and run:"
echo "  curl -fsSL https://bun.sh/install | bash"
echo "  bun install -g github:pompeii-labs/nero-oss"
echo "  nero"
