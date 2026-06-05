#!/usr/bin/env bash
set -e

# Apply all pending changesets: bumps each package version independently
# and updates internal dependency ranges.
#
# Before running this, create one or more changesets with:
#   pnpm changeset
#
# Usage: ./scripts/publish.sh

if ! pnpm changeset status --since=main 2>/dev/null | grep -q "changesets"; then
  echo "No pending changesets found. Run 'pnpm changeset' first."
  exit 1
fi

pnpm changeset version
git add .
git commit -m "chore: version packages"
git push origin main

echo "Done. GitHub Actions will publish to npm."
