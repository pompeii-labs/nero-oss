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

# Check required env var
if [ -z "$OPENROUTER_API_KEY" ]; then
    echo ""
    echo "Error: OPENROUTER_API_KEY is required"
    echo "Get an API key at: https://openrouter.ai/keys"
    echo ""
    echo "Run with: OPENROUTER_API_KEY=your_key bash docker.sh"
    exit 1
fi

# Pull latest image
echo "Pulling latest image..."
docker pull ghcr.io/$REPO:latest

# Run container
docker run -d \
    --name nero \
    --restart unless-stopped \
    -p 4848:4848 \
    -e OPENROUTER_API_KEY="$OPENROUTER_API_KEY" \
    -e TAVILY_API_KEY="$TAVILY_API_KEY" \
    -e DEEPGRAM_API_KEY="$DEEPGRAM_API_KEY" \
    -e ELEVENLABS_API_KEY="$ELEVENLABS_API_KEY" \
    -e NERO_LICENSE_KEY="$NERO_LICENSE_KEY" \
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
