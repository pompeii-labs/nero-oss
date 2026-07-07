#!/bin/sh
set -e

REPO="pompeii-labs/nero-oss"
BINARY="nero"
INSTALL_DIR="/usr/local/bin"

OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
    Linux)  OS_NAME="linux" ;;
    Darwin) OS_NAME="darwin" ;;
    *)      echo "Unsupported OS: $OS"; exit 1 ;;
esac

case "$ARCH" in
    x86_64|amd64)  ARCH_NAME="x64" ;;
    aarch64|arm64) ARCH_NAME="arm64" ;;
    *)             echo "Unsupported architecture: $ARCH"; exit 1 ;;
esac

ARTIFACT="nero-${OS_NAME}-${ARCH_NAME}"
TAG=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name"' | cut -d'"' -f4)
if [ -z "$TAG" ]; then
    echo "Could not find a Nero release. Check https://github.com/${REPO}/releases"
    exit 1
fi
URL="https://github.com/${REPO}/releases/download/${TAG}/${ARTIFACT}"

echo "Installing ${BINARY} ${TAG} (${OS_NAME}/${ARCH_NAME})..."

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

curl -fsSL "$URL" -o "$TMP/$BINARY" || {
    echo "Download failed: $URL"
    echo "See https://github.com/${REPO}/releases for available binaries."
    exit 1
}
chmod +x "$TMP/$BINARY"

if [ -w "$INSTALL_DIR" ]; then
    mv "$TMP/$BINARY" "$INSTALL_DIR/$BINARY"
else
    echo "Writing to ${INSTALL_DIR} (needs sudo)..."
    sudo mv "$TMP/$BINARY" "$INSTALL_DIR/$BINARY"
fi

echo "Installed ${BINARY} to ${INSTALL_DIR}/${BINARY}"
echo ""

if ! command -v docker >/dev/null 2>&1; then
    echo "Nero runs its stack with Docker - install Docker Desktop / Engine first."
    echo ""
fi

echo "Next:"
echo "  nero start            # brings up the stack (pulls images, provisions TLS)"
echo ""
echo "Set OPENROUTER_API_KEY in ~/.nero/.env so Nero can think (nero start will remind you)."
