#!/bin/bash

set -euo pipefail

WORKSPACE_DIR=$(cd "$(dirname "$0")/.." && pwd)
source "$WORKSPACE_DIR/.devcontainer/project-settings.sh"

DIST_DIR="${INTEGRATION_DIST_DIR:-$WORKSPACE_DIR/dist}"
TARGET_DIR="${INTEGRATION_HA_TARGET_DIR:-/config/www/$INTEGRATION_DOMAIN}"

if [ ! -d "$DIST_DIR" ]; then
  echo "No dist directory found at $DIST_DIR. Build $PROJECT_DISPLAY_NAME first."
  exit 0
fi

mapfile -t ASSET_FILES < <(find "$DIST_DIR" -type f -print | sort)

if [ "${#ASSET_FILES[@]}" -eq 0 ]; then
  echo "No built assets found in $DIST_DIR."
  exit 0
fi

mkdir -p "$TARGET_DIR"
rsync -a --delete "$DIST_DIR/" "$TARGET_DIR/"

echo "✓ ${#ASSET_FILES[@]} $PROJECT_DISPLAY_NAME asset(s) synced to $TARGET_DIR"
echo "  Refresh Home Assistant to load the updated build"
