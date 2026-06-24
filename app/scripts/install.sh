#!/usr/bin/env bash
# Installs OpencodeKeybar.app into /Applications and sets it to launch at login.
# Run on YOUR MAC (the client). Requires Xcode/Swift toolchain (swift build).
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_NAME="OpencodeKeybar"
APP="$DIR/dist/${APP_NAME}.app"
INSTALL_DIR="/Applications"
INSTALLED="$INSTALL_DIR/${APP_NAME}.app"
LABEL="nz.ac.javagrant.opencode-keybar.client"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"

echo ">> Building release + assembling .app bundle"
"$DIR/scripts/package.sh"

echo ">> Installing to $INSTALLED"
osascript -e 'tell application "'"$APP_NAME"' " to quit' 2>/dev/null || true
pkill -f "$INSTALLED/Contents/MacOS/$APP_NAME" 2>/dev/null || true
rm -rf "$INSTALLED"
cp -R "$APP" "$INSTALLED"

echo ">> Adding login item via launchd"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/open</string>
    <string>-a</string>
    <string>${INSTALLED}</string>
    <string>--args</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><false/>
</dict>
</plist>
EOF
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"

echo ">> Launching now"
open "$INSTALLED"

cat <<EOF

Installed. A key icon is now in your menu bar.
  App:      $INSTALLED
  Auto-run:  $PLIST

Open the menu → Settings… and set your SSH host (user@your-server).
The daemon must already be installed on that server (see server/install.sh).

Uninstall:
  launchctl unload "$PLIST" && rm "$PLIST"
  rm -rf "$INSTALLED"
EOF
