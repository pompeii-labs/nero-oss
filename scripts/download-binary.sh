#!/bin/bash
set -e

# Install CLI binary
echo "Installing CLI..."

REPO="pompeii-labs/nero-oss"

# Detect platform
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

case "$ARCH" in
    x86_64) ARCH="x64" ;;
    aarch64|arm64) ARCH="arm64" ;;
    *) echo "Unsupported architecture: $ARCH"; exit 1 ;;
esac

BINARY="nero-${OS}-${ARCH}"
INSTALL_DIR="${HOME}/.local/bin"

mkdir -p "$INSTALL_DIR"

echo "Downloading $BINARY..."
LATEST=$(curl -fsSL https://api.github.com/repos/$REPO/releases/latest | grep '"tag_name"' | cut -d'"' -f4)
curl -fsSL "https://github.com/$REPO/releases/download/$LATEST/$BINARY" -o "$INSTALL_DIR/nero"
chmod +x "$INSTALL_DIR/nero"

if [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
    echo ""
    echo "Add this to your shell profile:"
    echo "  export PATH=\"\$HOME/.local/bin:\$PATH\""
fi

echo "Installed nero $LATEST to $INSTALL_DIR/nero"