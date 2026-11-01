#!/bin/bash

set -euo pipefail

SETTINGS_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
SETTINGS_FILE="$SETTINGS_DIR/project.env"

if [ ! -f "$SETTINGS_FILE" ]; then
  echo "Missing project identity file: $SETTINGS_FILE" >&2
  exit 1
fi

# This is a committed, shell-compatible settings file maintained by the project.
# shellcheck disable=SC1090
source "$SETTINGS_FILE"

: "${PROJECT_DISPLAY_NAME:?PROJECT_DISPLAY_NAME must be set in project.env}"
: "${INTEGRATION_DOMAIN:?INTEGRATION_DOMAIN must be set in project.env}"

if [[ ! "$INTEGRATION_DOMAIN" =~ ^[a-z][a-z0-9_]*$ ]]; then
  echo "INTEGRATION_DOMAIN must be a lowercase Home Assistant domain." >&2
  exit 1
fi

export PROJECT_DISPLAY_NAME
export INTEGRATION_DOMAIN
