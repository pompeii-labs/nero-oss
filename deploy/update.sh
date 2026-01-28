#!/bin/bash
set -e

REPO="pompeii-labs/nero-oss"

echo "Updating Nero..."

# Detect installation type
if [ -f ~/.nero/docker-compose.yml ]; then
    echo "Detected Docker Compose installation"
    cd ~/.nero

    if docker compose version &> /dev/null; then
        docker compose pull
        docker compose down
        docker compose up -d
    else
        docker-compose pull
        docker-compose down
        docker-compose up -d
    fi

    echo "Docker containers updated!"

elif docker ps -a --format '{{.Names}}' | grep -q '^nero$'; then
    echo "Detected standalone Docker installation"

    echo "Pulling latest image..."
    docker pull ghcr.io/$REPO:latest

    # Get current container config
    CURRENT_ENV=$(docker inspect nero --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null || echo "")

    echo "Stopping current container..."
    docker stop nero 2>/dev/null || true
    docker rm nero 2>/dev/null || true

    echo "Starting updated container..."
    docker run -d \
        --name nero \
        --restart unless-stopped \
        -p 4848:4848 \
        -e OPENROUTER_API_KEY="${OPENROUTER_API_KEY}" \
        -e DEEPGRAM_API_KEY="${DEEPGRAM_API_KEY}" \
        -e ELEVENLABS_API_KEY="${ELEVENLABS_API_KEY}" \
        -e NERO_LICENSE_KEY="${NERO_LICENSE_KEY}" \
        -e DATABASE_URL="${DATABASE_URL}" \
        -e HOST_HOME="$HOME" \
        -v ~/.nero/config.json:/root/.nero/config.json:ro \
        -v "$HOME":/host/home:rw \
        ghcr.io/$REPO:latest

    echo "Docker container updated!"
fi

# Update CLI binary
echo ""
echo "Updating CLI binary..."

OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

case "$ARCH" in
    x86_64) ARCH="x64" ;;
    aarch64|arm64) ARCH="arm64" ;;
    *) echo "Unsupported architecture: $ARCH"; exit 1 ;;
esac

BINARY="nero-${OS}-${ARCH}"
INSTALL_DIR="/usr/local/bin"

LATEST=$(curl -fsSL https://api.github.com/repos/$REPO/releases/latest | grep '"tag_name"' | cut -d'"' -f4)
echo "Latest version: $LATEST"

curl -fsSL "https://github.com/$REPO/releases/download/$LATEST/$BINARY" -o /tmp/nero
chmod +x /tmp/nero
sudo mv /tmp/nero $INSTALL_DIR/nero

echo ""
echo "Nero updated to $LATEST!"
