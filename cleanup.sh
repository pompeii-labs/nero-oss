#!/usr/bin/env bash
set -euo pipefail

docker rm -f nero nero-db 2>/dev/null || true
docker volume rm nero_nero_data 2>/dev/null || true

if [[ -n "${USER_HOME:-}" && "$USER_HOME" != "/" ]]; then
    rm -rf -- "$USER_HOME/.nero"
fi
