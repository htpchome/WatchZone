#!/bin/bash

set -euo pipefail

if command -v codex >/dev/null 2>&1; then
  echo "✓ Codex CLI available: $(codex --version)"
  exit 0
fi

NPM_BIN=$(command -v npm)
echo "→ Installing Codex CLI..."
sudo env "PATH=$PATH" "$NPM_BIN" install --global @openai/codex@latest

if ! command -v codex >/dev/null 2>&1; then
  echo "Codex CLI installation completed but codex is not on PATH." >&2
  exit 1
fi

echo "✓ Codex CLI installed: $(codex --version)"
