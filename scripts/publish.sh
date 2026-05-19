#!/usr/bin/env bash
set -e

VERSION="$1"
MESSAGE="$2"

if [[ -z "$VERSION" || -z "$MESSAGE" ]]; then
  echo "Usage: ./scripts/publish.sh <version> <message>"
  echo "  Example: ./scripts/publish.sh 1.0.5 \"fix cache invalidation\""
  exit 1
fi

# Strip leading 'v' if provided
VERSION="${VERSION#v}"
TAG="v${VERSION}"

echo "Publishing ${TAG}: ${MESSAGE}"

npm version "$VERSION" --no-git-tag-version
git add .
git commit -m "${TAG}: ${MESSAGE}"
git tag "$TAG"
git push origin main "$TAG"

echo "Done. GitHub Actions will publish to npm."
