#!/bin/sh
set -e

mkdir -p "${SERVE_DIR}"
chown -R node:node "${SERVE_DIR}"

exec "$@"
