#!/bin/bash

set -euo pipefail

CONFLICTING_PROJECT="frigateviewcard_devcontainer"

mapfile -t CONTAINER_IDS < <(
  docker ps \
    --filter "label=com.docker.compose.project=$CONFLICTING_PROJECT" \
    --format "{{.ID}}"
)

if [ "${#CONTAINER_IDS[@]}" -eq 0 ]; then
  exit 0
fi

echo "Stopping the FrigateViewCard development stack to release shared ports..."
docker stop "${CONTAINER_IDS[@]}" >/dev/null
echo "✓ FrigateViewCard development containers stopped"
