#!/usr/bin/env bash
# One-shot installer for both halves of opencode-keybar.
#   ./install.sh server   -> install the JSON daemon (run on the server)
#   ./install.sh client   -> build + install the menu bar app (run on your Mac)
#   ./install.sh          -> interactive prompt
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() { echo "usage: $0 {server|client}"; exit 1; }

case "${1:-}" in
  server) exec "$DIR/server/install.sh" ;;
  client) exec "$DIR/app/scripts/install.sh" ;;
  "")
    echo "opencode-keybar installer"
    select which in "server (daemon, runs on the opencode host)" "client (menu bar app, runs on your Mac)"; do
      case "$which" in
        server*) exec "$DIR/server/install.sh" ;;
        client*) exec "$DIR/app/scripts/install.sh" ;;
      esac
    done
    ;;
  *) usage ;;
esac
