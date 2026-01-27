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

# Install CLI
echo "Installing CLI..."

# Install bun if missing
if ! command -v bun &> /dev/null; then
    # Install unzip if needed
    if ! command -v unzip &> /dev/null; then
        echo "Installing unzip..."
        if command -v apt-get &> /dev/null; then
            sudo apt-get install -y unzip 2>/dev/null || sudo apt-get update && sudo apt-get install -y unzip
        elif command -v yum &> /dev/null; then
            sudo yum install -y unzip
        elif command -v apk &> /dev/null; then
            sudo apk add unzip
        fi
    fi

    curl -fsSL https://bun.sh/install | bash
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"
fi

# Ensure bun is in PATH for this session
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"

bun install -g github:pompeii-labs/nero-oss

# Add to shell profile if not already there
SHELL_PROFILE="$HOME/.bashrc"
[ -f "$HOME/.zshrc" ] && SHELL_PROFILE="$HOME/.zshrc"

if ! grep -q "BUN_INSTALL" "$SHELL_PROFILE" 2>/dev/null; then
    echo '' >> "$SHELL_PROFILE"
    echo '# Bun' >> "$SHELL_PROFILE"
    echo 'export BUN_INSTALL="$HOME/.bun"' >> "$SHELL_PROFILE"
    echo 'export PATH="$BUN_INSTALL/bin:$PATH"' >> "$SHELL_PROFILE"
fi

echo ""
echo "Nero installed successfully!"
echo ""
echo "Run 'source ~/.bashrc' (or restart your terminal) then:"
echo "  nero"
echo ""
echo "Config: ~/.nero/config.json"
