#!/bin/bash
set -e

REPO="pompeii-labs/nero-oss"

echo "Installing Nero CLI..."

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

echo "Fetching latest release..."
LATEST=$(curl -fsSL https://api.github.com/repos/$REPO/releases/latest | grep '"tag_name"' | cut -d'"' -f4)

echo "Downloading $BINARY ($LATEST)..."
curl -fsSL "https://github.com/$REPO/releases/download/$LATEST/$BINARY" -o "$INSTALL_DIR/nero"
chmod +x "$INSTALL_DIR/nero"

if [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
    echo ""
    echo "Add to your shell profile:"
    echo "  export PATH=\"\$HOME/.local/bin:\$PATH\""
    echo ""
    echo "Then restart your shell or run:"
    echo "  source ~/.bashrc  # or ~/.zshrc"
fi

echo ""
echo "Nero $LATEST installed!"
echo ""
echo "Next steps:"
echo "  1. Create ~/.nero/.env with your API keys:"
echo "     OPENROUTER_API_KEY=..."
echo ""
echo "  2. Run: nero setup"
