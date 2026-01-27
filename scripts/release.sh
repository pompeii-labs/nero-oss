#!/bin/bash
set -e

VERSION=$(node -p "require('./package.json').version")
TAG="v$VERSION"

if git rev-parse "$TAG" >/dev/null 2>&1; then
    echo "Error: Tag $TAG already exists"
    exit 1
fi

echo "Creating release $TAG..."

git tag -a "$TAG" -m "Release $VERSION"
git push origin main
git push origin "$TAG"

echo "Released $TAG"
