#!/bin/bash
set -e

REPO="pompeii-labs/nero-oss"

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

# Create .env template if missing
if [ ! -f ~/.nero/.env ]; then
    cat > ~/.nero/.env << 'EOF'
OPENROUTER_API_KEY=
TAVILY_API_KEY=
DEEPGRAM_API_KEY=
ELEVENLABS_API_KEY=
NERO_LICENSE_KEY=
EOF
    echo "Created ~/.nero/.env - add your API keys there"
fi

# Download docker-compose.yml
curl -fsSL https://raw.githubusercontent.com/$REPO/main/deploy/docker-compose.yml -o ~/.nero/docker-compose.yml

# Start services
cd ~/.nero
if docker compose version &> /dev/null; then
    docker compose pull
    docker compose down 2>/dev/null || true
    docker compose up -d
else
    docker-compose pull
    docker-compose down 2>/dev/null || true
    docker-compose up -d
fi

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
