#!/bin/bash

# Shows commits since last tag to help write changelog entries

LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null)

if [ -z "$LAST_TAG" ]; then
    echo "No tags found. Showing last 20 commits:"
    git log --oneline -20
    exit 0
fi

CURRENT_VERSION=$(node -p "require('./package.json').version")

echo "=================================="
echo "Release Prep for Nero"
echo "=================================="
echo ""
echo "Last release: $LAST_TAG"
echo "Current version in package.json: $CURRENT_VERSION"
echo ""
echo "Commits since $LAST_TAG:"
echo "----------------------------------"

git log --oneline --no-merges ${LAST_TAG}..HEAD --pretty=format:"- %s"

echo ""
echo ""
echo "----------------------------------"
echo "Categorize these for CHANGELOG.md:"
echo ""
echo "### Highlights"
echo "(major features)"
echo ""
echo "### Changes"
echo "(new features, improvements)"
echo ""
echo "### Fixes"
echo "(bug fixes)"
echo ""
echo "### Breaking"
echo "(backward-incompatible changes)"
echo ""
echo "----------------------------------"
echo ""
echo "After updating CHANGELOG.md, run:"
echo "  bun run release"
