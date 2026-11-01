#!/bin/bash

set -euo pipefail

WORKSPACE_DIR=$(cd "$(dirname "$0")/.." && pwd)
source "$WORKSPACE_DIR/.devcontainer/project-settings.sh"
LAST_SIGNATURE=""

echo "Watching the $PROJECT_DISPLAY_NAME backend and frontend build output..."
echo "Press Ctrl+C to stop"

while true; do
  WATCH_PATHS=()
  for candidate in \
    "$WORKSPACE_DIR/custom_components/$INTEGRATION_DOMAIN" \
    "$WORKSPACE_DIR/backend/custom_components/$INTEGRATION_DOMAIN" \
    "$WORKSPACE_DIR/dist" \
    "$WORKSPACE_DIR/frontend/dist"; do
    if [ -d "$candidate" ]; then
      WATCH_PATHS+=("$candidate")
    fi
  done

  if [ "${#WATCH_PATHS[@]}" -gt 0 ]; then
    CURRENT_SIGNATURE=$(find "${WATCH_PATHS[@]}" -type f -printf '%p:%s:%T@\n' 2>/dev/null | sort | sha256sum | cut -d' ' -f1)
    if [ -n "$LAST_SIGNATURE" ] && [ "$CURRENT_SIGNATURE" != "$LAST_SIGNATURE" ]; then
      bash "$WORKSPACE_DIR/.devcontainer/sync-integration.sh"
    fi
    LAST_SIGNATURE="$CURRENT_SIGNATURE"
  fi
  sleep 2
done
