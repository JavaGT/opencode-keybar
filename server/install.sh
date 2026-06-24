#!/usr/bin/env bash
# Installs the opencode-keybar daemon as a macOS launchd user agent.
# Run on the SERVER (where the opencode config lives).
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LABEL="nz.ac.javagrant.opencode-keybar.daemon"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
PORT="${OPENCODE_KEYBAR_PORT:-47788}"

# Resolve node — launchd does not inherit the shell PATH, so we must use
# an absolute path. Prefer $OPENCODE_KEYBAR_NODE, then `command -v node`,
# then common homebrew locations.
NODE_BIN="${OPENCODE_KEYBAR_NODE:-}"
if [ -z "$NODE_BIN" ]; then
  NODE_BIN="$(command -v node 2>/dev/null || true)"
fi
if [ -z "$NODE_BIN" ] || [ ! -x "$NODE_BIN" ]; then
  for cand in /opt/homebrew/bin/node /usr/local/bin/node /usr/bin/node; do
    [ -x "$cand" ] && NODE_BIN="$cand" && break
  done
fi
if [ -z "$NODE_BIN" ] || [ ! -x "$NODE_BIN" ]; then
  echo "ERROR: node not found. Set OPENCODE_KEYBAR_NODE to its absolute path." >&2
  exit 1
fi

# Optional shared-secret token. Set OPENCODE_KEYBAR_TOKEN before running to
# require a Bearer token from the client. Leave empty to skip auth (the daemon
# binds to 127.0.0.1 only, reachable solely via SSH tunnel).
TOKEN="${OPENCODE_KEYBAR_TOKEN:-}"

cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${NODE_BIN}</string>
    <string>${DIR}/daemon.mjs</string>
  </array>
  <key>WorkingDirectory</key><string>${DIR}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>OPENCODE_KEYBAR_PORT</key><string>${PORT}</string>
    <key>OPENCODE_KEYBAR_HOST</key><string>127.0.0.1</string>
    <key>OPENCODE_KEYBAR_TOKEN</key><string>${TOKEN}</string>
    <key>HOME</key><string>${HOME}</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${HOME}/.config/opencode-keybar/daemon.log</string>
  <key>StandardErrorPath</key><string>${HOME}/.config/opencode-keybar/daemon.log</string>
</dict>
</plist>
PLIST

mkdir -p "$HOME/.config/opencode-keybar"
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
echo "Installed ${LABEL}."
echo "  Port:   ${PORT} (127.0.0.1 only)"
echo "  Auth:   ${TOKEN:+bearer token} ${TOKEN:-none}"
echo "  Log:    ~/.config/opencode-keybar/daemon.log"
echo "  Stop:   launchctl unload \"$PLIST\""
