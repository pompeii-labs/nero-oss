#!/bin/bash
set -e

REPO="pompeii-labs/nero-oss"

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
fi

# Run container
docker run -d \
    --name nero \
    --restart unless-stopped \
    -p 4848:4848 \
    -e OPENROUTER_API_KEY="$OPENROUTER_API_KEY" \
    -e DATABASE_URL="$DATABASE_URL" \
    -e HOST_HOME="$HOME" \
    -v ~/.nero/config.json:/root/.nero/config.json:ro \
    -v "$HOME":/host/home:rw \
    ghcr.io/$REPO:latest

# Install CLI binary
echo "Installing CLI..."

# Detect platform
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

case "$ARCH" in
    x86_64) ARCH="x64" ;;
    aarch64|arm64) ARCH="arm64" ;;
    *) echo "Unsupported architecture: $ARCH"; exit 1 ;;
esac

BINARY="nero-${OS}-${ARCH}"
INSTALL_DIR="/usr/local/bin"

# Download latest binary
echo "Downloading $BINARY..."
LATEST=$(curl -fsSL https://api.github.com/repos/$REPO/releases/latest | grep '"tag_name"' | cut -d'"' -f4)
curl -fsSL "https://github.com/$REPO/releases/download/$LATEST/$BINARY" -o /tmp/nero
chmod +x /tmp/nero
sudo mv /tmp/nero $INSTALL_DIR/nero

echo ""
echo "Nero installed successfully!"
echo ""
echo "Run: nero"
echo ""
echo "Config: ~/.nero/config.json"
