#!/bin/bash
set -e

REPO="pompeii-labs/nero-oss"
MODIFY_PATH=true

for arg in "$@"; do
    case "$arg" in
        --no-modify-path) MODIFY_PATH=false ;;
    esac
done

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
    export PATH="$INSTALL_DIR:$PATH"

    if [[ "$MODIFY_PATH" == true ]]; then
        SHELL_NAME=$(basename "$SHELL")
        case "$SHELL_NAME" in
            zsh)  PROFILE="$HOME/.zshrc" ;;
            bash)
                if [[ -f "$HOME/.bash_profile" ]]; then
                    PROFILE="$HOME/.bash_profile"
                else
                    PROFILE="$HOME/.bashrc"
                fi
                ;;
            *)    PROFILE="" ;;
        esac

        LINE='export PATH="$HOME/.local/bin:$PATH"'
        if [[ -n "$PROFILE" ]] && ! grep -qF '.local/bin' "$PROFILE" 2>/dev/null; then
            echo "" >> "$PROFILE"
            echo "$LINE" >> "$PROFILE"
            echo "Added $INSTALL_DIR to PATH in $PROFILE"
        fi
    else
        echo "Skipping shell profile modification (--no-modify-path)"
        echo "Add to your shell profile manually:"
        echo "  export PATH=\"\$HOME/.local/bin:\$PATH\""
    fi
fi

echo ""
echo "Nero $LATEST installed!"
echo ""

exec "$INSTALL_DIR/nero" setup
