#!/bin/bash
# Convert HTML gallery images to PNG for Product Hunt
# Run this from the nero-oss directory with Chrome/Chromium installed

set -e

OUTPUT_DIR="${1:-./assets}"
mkdir -p "$OUTPUT_DIR"

echo "Converting gallery images to PNG..."

# Check for Chrome/Chromium
if command -v google-chrome &> /dev/null; then
    CHROME=google-chrome
elif command -v chromium &> /dev/null; then
    CHROME=chromium
elif command -v chromium-browser &> /dev/null; then
    CHROME=chromium-browser
else
    echo "Error: Chrome/Chromium not found. Please install it first."
    echo "On macOS: brew install chromium"
    echo "On Ubuntu: sudo apt-get install chromium-browser"
    exit 1
fi

# Convert each gallery image
for i in 1 2 3 4 5; do
    HTML_FILE="./assets/gallery-image-${i}.html"
    OUTPUT_FILE="$OUTPUT_DIR/gallery-image-${i}.png"
    
    if [ -f "$HTML_FILE" ]; then
        echo "Converting gallery-image-${i}.html..."
        "$CHROME" --headless --disable-gpu --screenshot="$OUTPUT_FILE" \
            --window-size=1280,800 \
            --hide-scrollbars \
            --run-all-compositor-stages-before-draw \
            "file://$(pwd)/$HTML_FILE"
        echo "  → $OUTPUT_FILE"
    else
        echo "Warning: $HTML_FILE not found, skipping..."
    fi
done

echo ""
echo "✓ All gallery images converted!"
echo ""
echo "Next steps:"
echo "1. Verify the PNGs look correct"
echo "2. Commit: git add assets/gallery-image-*.png"
echo "3. Push: git push origin main"
echo "4. Submit to Product Hunt with these images"
