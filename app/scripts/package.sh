#!/bin/bash
# Builds the release binary and assembles an .app bundle.
set -euo pipefail

cd "$(dirname "$0")/.."
APP_DIR="$(pwd)"

echo ">> Building release binary"
swift build -c release

BIN_PATH="$(swift build -c release --show-bin-path)/OpencodeKeybar"
if [ ! -f "$BIN_PATH" ]; then
    echo "ERROR: binary not found at $BIN_PATH" >&2
    exit 1
fi

BUNDLE="$APP_DIR/dist/OpencodeKeybar.app"
echo ">> Assembling bundle at $BUNDLE"
rm -rf "$BUNDLE"
mkdir -p "$BUNDLE/Contents/MacOS"
mkdir -p "$BUNDLE/Contents/Resources"

cp "$BIN_PATH" "$BUNDLE/Contents/MacOS/OpencodeKeybar"
cp "$APP_DIR/Resources/Info.plist" "$BUNDLE/Contents/Info.plist"

echo ">> Fixing up dylib rpaths"
install_name_tool -add_rpath "@executable_path/../Frameworks" "$BUNDLE/Contents/MacOS/OpencodeKeybar" 2>/dev/null || true

# Strip for a smaller binary (keep debug-less release)
strip -x "$BUNDLE/Contents/MacOS/OpencodeKeybar" 2>/dev/null || true

echo ">> Done"
echo "   Bundle: $BUNDLE"
echo "   Launch: open $BUNDLE"
ls -la "$BUNDLE/Contents/MacOS"
