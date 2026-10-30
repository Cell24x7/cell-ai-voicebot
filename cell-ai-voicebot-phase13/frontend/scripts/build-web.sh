#!/usr/bin/env bash
# Public VITE_* values only; never load backend.env into this build.
set -euo pipefail
sha="${1:-}"
[[ "${sha}" =~ ^[a-f0-9]{40}$ ]] || { echo 'usage: build-web.sh <40-character sha>' >&2; exit 2; }
npm ci --ignore-scripts --no-audit --no-fund
npm run build
tar -czf "dist-${sha}.tgz" -C dist .
echo "Web artifact ready (${sha})"
