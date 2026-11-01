#!/bin/bash

set -euo pipefail

WORKSPACE_DIR=$(cd "$(dirname "$0")/.." && pwd)
source "$WORKSPACE_DIR/.devcontainer/project-settings.sh"
INTEGRATION_SOURCE=""

if [ -d "$WORKSPACE_DIR/custom_components/$INTEGRATION_DOMAIN" ]; then
  INTEGRATION_SOURCE="$WORKSPACE_DIR/custom_components/$INTEGRATION_DOMAIN"
elif [ -d "$WORKSPACE_DIR/backend/custom_components/$INTEGRATION_DOMAIN" ]; then
  INTEGRATION_SOURCE="$WORKSPACE_DIR/backend/custom_components/$INTEGRATION_DOMAIN"
fi

if [ -n "$INTEGRATION_SOURCE" ]; then
  TARGET_DIR="/config/custom_components/$INTEGRATION_DOMAIN"
  mkdir -p "$TARGET_DIR"
  rsync -a --delete \
    --exclude '__pycache__/' \
    --exclude '*.pyc' \
    "$INTEGRATION_SOURCE/" "$TARGET_DIR/"
  echo "✓ Python integration synced to $TARGET_DIR"
else
  echo "No custom_components/$INTEGRATION_DOMAIN backend found; backend sync skipped"
fi

if [ -d "$WORKSPACE_DIR/frontend/dist" ]; then
  INTEGRATION_DIST_DIR="$WORKSPACE_DIR/frontend/dist" \
    bash "$WORKSPACE_DIR/.devcontainer/sync-assets.sh"
elif [ -d "$WORKSPACE_DIR/dist" ]; then
  bash "$WORKSPACE_DIR/.devcontainer/sync-assets.sh"
else
  echo "No frontend dist directory found; frontend sync skipped"
fi

echo "Restart Home Assistant after Python backend changes."
