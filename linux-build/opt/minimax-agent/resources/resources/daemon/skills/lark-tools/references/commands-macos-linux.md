# lark-tools Commands — macOS / Linux

Shell: bash or zsh. Use these recipes only on `darwin` / `linux` platforms.

Do not copy these snippets into Windows PowerShell. Windows has a separate reference: `commands-windows-powershell.md`.

## install-lark-cli

```bash
if ! command -v lark-cli >/dev/null 2>&1; then
  echo "lark-cli not found, installing @larksuite/cli globally..."
  npm install -g @larksuite/cli
fi
lark-cli --version    # confirm install succeeded
```

If the install fails with `EACCES`, prefer a per-user prefix over `sudo` and tell the user before escalating.

## resolve-daemon-url

```bash
DATA_DIR="${__MAVIS_PARENT_DATA_DIR:-$HOME/.mavis}"
if [ -f "$DATA_DIR/daemon.port" ]; then
  DAEMON_PORT="$(cat "$DATA_DIR/daemon.port")"
else
  DAEMON_PORT="$(mavis status 2>/dev/null | sed -n 's/^Port:[[:space:]]*//p' | head -n 1)"
fi
if [ -z "$DAEMON_PORT" ]; then
  echo "Could not resolve Mavis daemon port; check <agent-context> daemonPort or run mavis status" >&2
  exit 1
fi
DAEMON_BASE="http://127.0.0.1:${DAEMON_PORT}"
```

## bot-status

```bash
lark-cli auth status 2>/dev/null \
  | jq '{appId, identity, userOpenId, userName, tokenStatus, scope}'
```

## auth-status

```bash
lark-cli auth status 2>/dev/null \
  | jq '{appId, identity, userOpenId, userName, tokenStatus, scope, expiresAt}'
```

## onboard-start

```bash
START="$(curl -s -X POST "${DAEMON_BASE}/mavis/api/lark/onboard/start" \
  -H 'Content-Type: application/json' \
  -d '{"name":"main"}')"
SESSION_ID="$(echo "$START" | jq -r '.sessionId')"
echo "$START" | jq '{sessionId, verificationUriComplete, userCode, expiresIn, intervalSec}'
```

## onboard-poll

```bash
curl -s "${DAEMON_BASE}/mavis/api/lark/onboard/status?sessionId=${SESSION_ID}" | jq
```

Wait `intervalSec` between calls. Stop when `.status` is `done` or you intend to abort.

## onboard-cancel

```bash
curl -s -X POST "${DAEMON_BASE}/mavis/api/lark/onboard/cancel" \
  -H 'Content-Type: application/json' \
  -d "{\"sessionId\":\"${SESSION_ID}\"}"
```
