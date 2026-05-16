#!/bin/sh
set -e
PLUGIN_DIR="${1:-/usr/src/app/node_modules/nodebb-plugin-wukong-chat}"
mkdir -p "$PLUGIN_DIR/public/vendor"
if command -v curl >/dev/null 2>&1; then
  curl -L -o "$PLUGIN_DIR/public/vendor/wukongimjssdk.umd.js" https://cdn.jsdelivr.net/npm/wukongimjssdk@latest/lib/wukongimjssdk.umd.js
elif command -v wget >/dev/null 2>&1; then
  wget -O "$PLUGIN_DIR/public/vendor/wukongimjssdk.umd.js" https://cdn.jsdelivr.net/npm/wukongimjssdk@latest/lib/wukongimjssdk.umd.js
else
  echo "curl/wget not found" >&2
  exit 1
fi
ls -lh "$PLUGIN_DIR/public/vendor/wukongimjssdk.umd.js"
