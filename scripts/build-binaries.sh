#!/bin/bash
set -e

VERSION=$(node -p "require('./package.json').version")
OUT_DIR="dist/binaries"

echo "Building Nero v$VERSION binaries..."

rm -rf $OUT_DIR
mkdir -p $OUT_DIR

# Build for each platform
# Note: Cross-compilation requires running on each platform or using --target

targets=(
    "linux-x64"
    "linux-arm64"
    "darwin-x64"
    "darwin-arm64"
)

for target in "${targets[@]}"; do
    echo "Building for $target..."
    bun build --compile --target=bun-$target --define "NERO_VERSION='$VERSION'" src/index.ts --outfile "$OUT_DIR/nero-$target"
done

# Create checksums
echo "Creating checksums..."
cd $OUT_DIR
sha256sum nero-* > checksums.txt 2>/dev/null || shasum -a 256 nero-* > checksums.txt

echo "Done! Binaries in $OUT_DIR"
ls -lh $OUT_DIR
