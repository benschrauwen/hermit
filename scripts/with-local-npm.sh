#!/usr/bin/env bash
set -euo pipefail

mkdir -p .home .npm-cache

export NPM_CONFIG_CACHE="${PWD}/.npm-cache"
export npm_config_cache="${PWD}/.npm-cache"

exec "$@"
