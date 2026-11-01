#!/bin/bash

set -euo pipefail

WORKSPACE_DIR=$(cd "$(dirname "$0")/.." && pwd)
source "$WORKSPACE_DIR/.devcontainer/project-settings.sh"

sudo mkdir -p /home/node/.codex
sudo chown -R node:node /home/node/.codex

echo "═══════════════════════════════════════════════════════════"
echo "  $PROJECT_DISPLAY_NAME DevContainer - Initial Setup"
echo "═══════════════════════════════════════════════════════════"

echo ""
echo "→ Setting up Home Assistant configuration..."
if [ -d "/config" ]; then
  sudo cp -rn "$WORKSPACE_DIR/.devcontainer/homeassistant/"* /config/ 2>/dev/null || true
  sudo mkdir -p /config/themes /config/www
  sudo chown -R node:node /config/themes /config/www 2>/dev/null || true
  echo "  ✓ Home Assistant config copied"
else
  echo "  ⚠ /config is not available yet"
fi

echo ""
echo "→ Checking for Python backend dependencies..."
PYTHON_PROJECT_DIR=""
if [ -f "$WORKSPACE_DIR/backend/pyproject.toml" ] || [ -f "$WORKSPACE_DIR/backend/requirements.txt" ] || [ -f "$WORKSPACE_DIR/backend/requirements-dev.txt" ]; then
  PYTHON_PROJECT_DIR="$WORKSPACE_DIR/backend"
elif [ -f "$WORKSPACE_DIR/pyproject.toml" ] || [ -f "$WORKSPACE_DIR/requirements.txt" ] || [ -f "$WORKSPACE_DIR/requirements-dev.txt" ]; then
  PYTHON_PROJECT_DIR="$WORKSPACE_DIR"
fi

if [ -n "$PYTHON_PROJECT_DIR" ]; then
  python -m venv "$WORKSPACE_DIR/.venv"
  "$WORKSPACE_DIR/.venv/bin/python" -m pip install --upgrade pip
  if [ -f "$PYTHON_PROJECT_DIR/requirements-dev.txt" ]; then
    "$WORKSPACE_DIR/.venv/bin/pip" install -r "$PYTHON_PROJECT_DIR/requirements-dev.txt"
  elif [ -f "$PYTHON_PROJECT_DIR/requirements.txt" ]; then
    "$WORKSPACE_DIR/.venv/bin/pip" install -r "$PYTHON_PROJECT_DIR/requirements.txt"
  fi
  if [ -f "$PYTHON_PROJECT_DIR/pyproject.toml" ]; then
    "$WORKSPACE_DIR/.venv/bin/pip" install -e "$PYTHON_PROJECT_DIR"
  fi
  echo "  ✓ Python backend environment created at .venv"
else
  echo "  ✓ No Python project metadata found; backend installation skipped"
fi

echo ""
echo "→ Checking for TypeScript frontend dependencies..."
NODE_PROJECT_DIR=""
if [ -f "$WORKSPACE_DIR/package.json" ]; then
  NODE_PROJECT_DIR="$WORKSPACE_DIR"
elif [ -f "$WORKSPACE_DIR/frontend/package.json" ]; then
  NODE_PROJECT_DIR="$WORKSPACE_DIR/frontend"
fi

if [ -n "$NODE_PROJECT_DIR" ]; then
  cd "$NODE_PROJECT_DIR"
  if [ -f "pnpm-lock.yaml" ]; then
    corepack pnpm install --frozen-lockfile
  elif [ -f "yarn.lock" ]; then
    corepack yarn install --immutable
  elif [ -f "package-lock.json" ]; then
    npm ci
  else
    npm install
  fi
  echo "  ✓ TypeScript frontend dependencies installed"
else
  echo "  ✓ No package.json found; frontend installation skipped"
fi

if [ -n "$NODE_PROJECT_DIR" ] && cd "$NODE_PROJECT_DIR" && node -e 'require.resolve("@playwright/test")' >/dev/null 2>&1; then
  echo ""
  echo "→ Verifying bundled Playwright browsers..."
  node --input-type=module -e '
    import { accessSync, constants } from "node:fs";
    import { chromium, firefox, webkit } from "@playwright/test";
    for (const browserType of [chromium, firefox, webkit]) {
      accessSync(browserType.executablePath(), constants.X_OK);
    }
  '
  echo "  ✓ Bundled Playwright browsers verified"
fi

chmod +x "$WORKSPACE_DIR/.devcontainer/sync-assets.sh"
chmod +x "$WORKSPACE_DIR/.devcontainer/watch-assets.sh"
chmod +x "$WORKSPACE_DIR/.devcontainer/sync-integration.sh"

echo ""
bash "$WORKSPACE_DIR/.devcontainer/ensure-codex.sh"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  $PROJECT_DISPLAY_NAME DevContainer Ready"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Open the Codex panel from the Activity Bar and sign in the first time."
echo "Codex state will persist in this repository's Docker Compose volume."
