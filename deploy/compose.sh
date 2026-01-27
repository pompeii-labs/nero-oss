#!/bin/bash
set -e

echo "Installing Nero (Docker Compose)..."

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

# Create .env
echo "OPENROUTER_API_KEY=$OPENROUTER_API_KEY" > ~/.nero/.env

# Download docker-compose.yml
curl -fsSL https://raw.githubusercontent.com/pompeii-labs/nero-oss/main/deploy/docker-compose.yml -o ~/.nero/docker-compose.yml

# Start services
cd ~/.nero
if docker compose version &> /dev/null; then
    docker compose up -d
else
    docker-compose up -d
fi

echo ""
echo "Nero is running at http://localhost:4848"
echo "Config: ~/.nero/config.json"
echo ""
echo "To use the CLI, install bun and run:"
echo "  curl -fsSL https://bun.sh/install | bash"
echo "  bun install -g github:pompeii-labs/nero-oss"
echo "  nero"
