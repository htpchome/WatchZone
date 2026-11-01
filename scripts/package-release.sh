#!/usr/bin/env bash

set -euo pipefail

REPOSITORY_ROOT=$(cd "$(dirname "$0")/.." && pwd)
SOURCE_DIR="$REPOSITORY_ROOT/custom_components/watchzone"
FRONTEND_DIR="$REPOSITORY_ROOT/dist/frontend"
PACKAGE_DIR="$REPOSITORY_ROOT/dist/package"
ARCHIVE_PATH="$REPOSITORY_ROOT/dist/watchzone.zip"

if [ ! -f "$FRONTEND_DIR/watchzone.js" ]; then
  echo "Missing frontend build: $FRONTEND_DIR/watchzone.js" >&2
  exit 1
fi

if [ ! -f "$FRONTEND_DIR/.vite/manifest.json" ]; then
  echo "Missing Vite asset manifest" >&2
  exit 1
fi

node "$REPOSITORY_ROOT/scripts/check-version.mjs"
node "$REPOSITORY_ROOT/scripts/validate-build.mjs"

rm -rf "$PACKAGE_DIR"
rm -f "$ARCHIVE_PATH"
mkdir -p "$PACKAGE_DIR/frontend"

rsync -a \
  --exclude 'frontend/' \
  --exclude '__pycache__/' \
  --exclude '*.pyc' \
  "$SOURCE_DIR/" "$PACKAGE_DIR/"
rsync -a "$FRONTEND_DIR/" "$PACKAGE_DIR/frontend/"

(
  cd "$PACKAGE_DIR"
  zip -q -r "$ARCHIVE_PATH" .
)

for required in __init__.py manifest.json frontend/watchzone.js; do
  if ! unzip -Z1 "$ARCHIVE_PATH" | grep -Fxq "$required"; then
    echo "Release archive is missing $required" >&2
    exit 1
  fi
done

if unzip -Z1 "$ARCHIVE_PATH" | grep -Eq '^(dist|package|custom_components|watchzone)/'; then
  echo "Release archive contains a forbidden wrapping directory" >&2
  exit 1
fi

echo "Created $ARCHIVE_PATH"
