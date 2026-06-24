# opencode-keybar

A macOS menu bar app to switch [opencode](https://opencode.ai) API keys/profiles on a
**remote server**, over SSH. It is a GUI port of the `switch-opencode-keys` CLI TUI.

Two parts:

| Part | Where it runs | What it does |
|------|---------------|--------------|
| **server/** | The machine running opencode | A tiny HTTP JSON daemon (Node) that reads/writes the opencode key config. Binds to `127.0.0.1` only — never exposed to the network. |
| **app/**    | Your Mac (menu bar)          | A SwiftUI `MenuBarExtra` app. Opens an SSH tunnel to the server and talks to the daemon through it. |

```
  ┌─────────────┐   SSH tunnel       ┌──────────────┐
  │  your Mac   │ ─────────────────▶ │   server     │
  │ menu bar app│  -L 47788:…:47788  │ daemon :47788│ ──▶ ~/.config/opencode/
  └─────────────┘                    └──────────────┘     ~/.secrets/llm-api-keys/
```

## Quick install

```sh
git clone https://github.com/JavaGT/opencode-keybar.git
cd opencode-keybar
./install.sh          # prompts: server or client
# or:
# ./install.sh server   # on the opencode host (installs daemon via launchd)
# ./install.sh client   # on your Mac (builds + installs the menu bar app)
```

## 1. Install the daemon (on the server)

```sh
cd server
./install.sh
```

This installs a launchd plist (`~/Library/LaunchAgents/nz.ac.javagrant.opencode-keybar.plist`)
that runs `daemon.mjs` on `127.0.0.1:47788` at login. Optional env vars:

| Var | Default | Purpose |
|-----|---------|---------|
| `OPENCODE_KEYBAR_PORT` | `47788` | Port to bind |
| `OPENCODE_KEYBAR_TOKEN` | _(none)_ | If set, the app must send `Authorization: Bearer <token>` |

Verify it's up:

```sh
curl http://127.0.0.1:47788/health   # → {"ok":true,...}
```

The daemon reuses the same data layer as the `switch-opencode-keys` CLI (`keys-lib.mjs`),
so they read/write the exact same files:

- `~/.config/opencode/keys/profiles.json` — profile definitions
- `~/.secrets/llm-api-keys/`             — key files
- `~/.config/opencode/opencode.json`     — opencode provider config
- `~/.local/share/opencode/auth.json`    — opencode/opencode-go shared auth

## 2. Build & run the app (on your Mac)

```sh
cd app
./scripts/package.sh        # builds release, assembles dist/OpencodeKeybar.app
open dist/OpencodeKeybar.app
```

A key icon appears in the menu bar. First run: open **Settings…** and set:

- **Host** — `user@your-server` (SSH target where the daemon runs)
- **Port** — SSH port (default 22)
- **Identity file** — path to your SSH private key (optional if you use an agent)
- **Local / Remote port** — both `47788` unless you changed `OPENCODE_KEYBAR_PORT`
- **Bearer token** — only if you set `OPENCODE_KEYBAR_TOKEN` on the server
- **Auto-refresh** — how often to re-pull status (0 = manual)

Settings are saved to `~/.config/opencode-keybar/settings.json`.

### Endpoints (daemon → app contract)

| Method | Path                  | Body                                | Returns |
|--------|-----------------------|-------------------------------------|---------|
| GET    | `/health`             | —                                   | `{ok}`  |
| GET    | `/status`             | —                                   | all providers + profiles + active |
| GET    | `/credits/:provider`  | —                                   | pioneer/zen/go usage |
| POST   | `/set`                | `{provider, name}`                  | switch active profile |
| POST   | `/add`                | `{provider, name, key, description}`| add a profile |
| POST   | `/delete`             | `{provider, name}`                  | delete a profile |

## Notes

- The app needs no special entitlements — it just spawns `ssh` and makes `localhost`
  HTTP calls, both of which work un-sandboxed. If you wrap it in a sandbox, grant
  network + process-spawn entitlements.
- `LSUIElement` is set in the Info.plist, so no dock icon; menu bar only.
- To uninstall the daemon: `launchctl unload ~/Library/LaunchAgents/nz.ac.javagrant.opencode-keybar.plist` and remove the plist.
