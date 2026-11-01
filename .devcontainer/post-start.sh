#!/bin/bash

set -euo pipefail

WORKSPACE_DIR=$(cd "$(dirname "$0")/.." && pwd)
source "$WORKSPACE_DIR/.devcontainer/project-settings.sh"

sudo mkdir -p /home/node/.codex
sudo chown -R node:node /home/node/.codex

bash "$WORKSPACE_DIR/.devcontainer/ensure-codex.sh"

if [ -d "/config" ]; then
  mkdir -p /config/themes /config/www
  if [ ! -f "/config/configuration.yaml" ]; then
    cp -rn "$WORKSPACE_DIR/.devcontainer/homeassistant/"* /config/ 2>/dev/null || true
    echo "✓ Home Assistant config initialized"
  fi
  if [ -d "$WORKSPACE_DIR/custom_components/$INTEGRATION_DOMAIN" ] || [ -d "$WORKSPACE_DIR/backend/custom_components/$INTEGRATION_DOMAIN" ] || [ -d "$WORKSPACE_DIR/dist" ] || [ -d "$WORKSPACE_DIR/frontend/dist" ]; then
    bash "$WORKSPACE_DIR/.devcontainer/sync-integration.sh" || true
  fi
fi

echo ""
echo "→ Waiting for services..."

for attempt in {1..30}; do
  if curl -fsS http://frigate:5000/api/version >/dev/null 2>&1; then
    echo "  ✓ Frigate is ready"
    break
  fi
  if [ "$attempt" -eq 30 ]; then
    echo "  ⚠ Frigate is still starting"
  fi
  sleep 2
done

for attempt in {1..30}; do
  if curl -fsS http://homeassistant:8123 >/dev/null 2>&1; then
    echo "  ✓ Home Assistant is ready"
    break
  fi
  if [ "$attempt" -eq 30 ]; then
    echo "  ⚠ Home Assistant is still starting"
  fi
  sleep 2
done

echo ""
echo "Services:"
echo "  • Home Assistant: http://localhost:8123"
echo "  • Frigate:        http://localhost:5000"
echo ""
echo "Codex is available from the OpenAI extension in the Activity Bar."
