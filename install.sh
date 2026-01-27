#!/bin/bash
set -e

REPO="pompeii-labs/nero-oss"
IMAGE="ghcr.io/$REPO:latest"

echo "Installing Nero..."

# Check for Docker
if ! command -v docker &> /dev/null; then
    echo "Error: Docker is required but not installed."
    echo "Install Docker: https://docs.docker.com/get-docker/"
    exit 1
fi

# Check for bun, install if missing
if ! command -v bun &> /dev/null; then
    echo "Installing bun..."
    curl -fsSL https://bun.sh/install | bash
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"
fi

# Create config directory
mkdir -p ~/.nero

# Create default config if it doesn't exist
if [ ! -f ~/.nero/config.json ]; then
    echo '{"mcpServers":{}}' > ~/.nero/config.json
    echo "Created ~/.nero/config.json"
fi

# Prompt for OpenRouter API key if not set
if [ -z "$OPENROUTER_API_KEY" ]; then
    echo ""
    echo "Nero requires an OpenRouter API key."
    echo "Get one at: https://openrouter.ai/keys"
    echo ""
    read -p "Enter your OpenRouter API key: " api_key

    # Add to shell profile
    SHELL_PROFILE="$HOME/.zshrc"
    if [ -f "$HOME/.bashrc" ] && [ ! -f "$HOME/.zshrc" ]; then
        SHELL_PROFILE="$HOME/.bashrc"
    fi

    echo "" >> "$SHELL_PROFILE"
    echo "# Nero" >> "$SHELL_PROFILE"
    echo "export OPENROUTER_API_KEY=\"$api_key\"" >> "$SHELL_PROFILE"
    export OPENROUTER_API_KEY="$api_key"
    echo "Added OPENROUTER_API_KEY to $SHELL_PROFILE"
fi

# Pull the Docker image
echo "Pulling Nero image..."
docker pull $IMAGE

# Create/update docker-compose in ~/.nero
cat > ~/.nero/docker-compose.yml << 'EOF'
services:
  nero:
    image: ghcr.io/pompeii-labs/nero-oss:latest
    container_name: nero
    restart: unless-stopped
    ports:
      - "4848:4848"
    environment:
      - OPENROUTER_API_KEY=${OPENROUTER_API_KEY}
      - DATABASE_URL=${DATABASE_URL:-}
    volumes:
      - ~/.nero/config.json:/root/.nero/config.json:ro
      - nero-data:/app/data
    stdin_open: true
    tty: true

volumes:
  nero-data:
EOF

# Start the service
echo "Starting Nero service..."
cd ~/.nero && docker compose up -d

# Install CLI globally
echo "Installing Nero CLI..."
bun install -g github:pompeii-labs/nero-oss

echo ""
echo "Nero installed successfully!"
echo ""
echo "Usage:"
echo "  nero              # Start interactive chat"
echo "  nero -m 'hello'   # Send a message"
echo "  nero mcp list     # List MCP servers"
echo ""
echo "Config: ~/.nero/config.json"
echo ""
