---
name: mcp-cli
description: "MCP management — add/configure servers, authenticate, sync skills, browse and call tools."
descriptions:
  zh-Hans: "管理 MCP：添加和配置 server、认证、同步 skills，并浏览或调用 MCP tools。"
---

# MCP Commands

MCP server tools are translated into Agent skills. Agents consume the generated skills and invoke tools via CLI.

## Server Management

### List all servers

```bash
mavis mcp list
```

Shows server name, transport type, auth status, skill status, configured/enabled state.

### Add or update a server

```bash
mavis mcp add <name> '{"url": "https://...", "auth": {"type": "bearer", "token": "..."}}'
```

Accepts a JSON config. Sets `configured: true` automatically.

### Get a server's raw config

```bash
mavis mcp get <name>
```

### Disable a server

```bash
mavis mcp remove <name>
```

For builtin servers: resets to unconfigured template. For user-added servers: disables.

## Authentication

Use genUI for collecting credentials. Do not ask the user to paste tokens in terminal output.

### OAuth2 flow

```bash
mavis mcp auth login <server>
```

Returns an `authUrl` for the user to visit. Tokens are stored automatically after browser callback.

### Bearer / API key setup

Use `mavis mcp add` with the auth config:

```bash
mavis mcp add my-server '{"url": "https://...", "auth": {"type": "bearer", "token": "..."}}'
```

Or use genUI to collect the token, then call `mavis mcp add` via the API.

### Check auth status

```bash
mavis mcp auth status [server]
```

## Sync

```bash
mavis mcp sync
```

Connects to each configured+enabled server, lists tools, generates skill files. Only regenerates when tools change. Skills take effect in the next session.

```bash
mavis mcp sync --status
```

## Tool Discovery

```bash
mavis mcp tools <server>          # list tools
mavis mcp tools <server> <tool>   # tool schema details
```

## Tool Invocation

```bash
mavis mcp call <server> <tool> '{"param": "value"}'
```

Use `--timeout <ms>` for long-running operations.

## Typical Workflow

```bash
# 1. See available servers (including unconfigured builtins)
mavis mcp list

# 2. Configure a server
mavis mcp add my-server '{"url": "https://...", "headers": {"api-key": "..."}}'

# 3. Authenticate if needed (OAuth2)
mavis mcp auth login my-server

# 4. Sync to generate skills
mavis mcp sync

# 5. Browse tools
mavis mcp tools my-server

# 6. Call a tool
mavis mcp call my-server search_docs '{"query": "how to deploy"}'
```

## Troubleshooting

### Matrix MCP 401 (auth failed)

The built-in `matrix` server uses the access token from the daemon's in-memory **parent
context** (pushed in by the Mavis desktop app at spawn time and hot-rotated via
`POST /mavis/internal/auth-context` on login / token refresh). The token is injected into the
`matrix-mcp-cli` process at **spawn time**. If the daemon had no token when the MCP process
first started, the process caches an empty token and all subsequent calls fail with 401 — even
after the daemon receives a fresh token via the hot-update endpoint.

**Symptoms:** `[matrix-mcp-cli:auth] POST /mavis/api/v1/mcp/tools → 401 401: auth failed`,
while `mavis mcp auth status matrix` shows `authenticated`.

**Fix — force reconnect (re-spawn the MCP process with fresh token):**

```bash
mavis mcp sync
```

This tears down the existing connection, re-spawns `matrix-mcp-cli` with the current token
from the daemon's in-memory parent context, and re-discovers tools.

**If sync still fails with 401:**

1. The token now lives in daemon memory only (no `~/.mavis/auth-{region}.json` file).
   Confirm the daemon has a token by checking the user-name surface (which travels through the
   same parent context):
   ```bash
   curl -s http://127.0.0.1:$(cat ~/.mavis/daemon.port)/api/agent/mavis | jq .userName
   ```
   If `userName` is null/empty, the daemon never received credentials — most likely because
   Electron pushed them after the initial spawn but the hot-update endpoint failed; check the
   Electron log for `[Storage] daemon auth-context push` warnings.
2. If a token is present, it may be expired or revoked — ask the user to **re-login in the
   Mavis desktop app** (Electron pushes a fresh token to the running daemon via the
   `/internal/auth-context` HTTP endpoint, no restart required).
3. After re-login, run `mavis mcp sync` again.

**Root cause:** The MCP connection pool keeps long-lived stdio processes. Updating the
daemon's in-memory token does NOT propagate to an already-running matrix-mcp-cli process.
`mavis mcp sync` is the only way to force a re-spawn with the latest token.

## Rules

- Agents use generated skills, not raw MCP tool catalogs.
- Use genUI for OAuth links and credential input.
- Use `mavis mcp add` to configure servers — do not edit files directly.
- `sync` generates skill files — they take effect in the next session.
