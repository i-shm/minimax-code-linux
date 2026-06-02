# Log Surfaces

Use this file when you are unsure **where the truth lives**.

## Surface map

| Surface | Contains | Missing | Best for |
|---|---|---|---|
| `mavis-session-log` artifact dir | Session-scoped baked views across local-proxy + daemon/plugin/opencode text logs | Anything outside the chosen session | First-pass diagnosis of a specific `ses_` or `mvs_` session |
| `local-proxy-*.jsonl` | Request bodies, status, timing, model, prompt, tools, cumulative messages | Streamed response body text; most daemon internals | Prompt/message/tool/usage analysis |
| `daemon-*.log` | Recovery, bridge, permission, routing, server-side lifecycle | Actual prompt body | Why the daemon behaved the way it did |
| `plugin-*.log` | Prompt transforms, injections, plugin-side events | Full daemon lifecycle | Prompt/tool mutation debugging |
| `opencode-*.log` | Runtime child health, spawn/crash/adapter details | Rich session context | Runtime-level failures |

## Decision rules

- Need to know what the model saw: local-proxy or the bakery's `conversation.txt` / `system.txt` /
  `tools.json`.
- Need to know why the daemon interrupted / retried / denied something: `daemon.log`.
- Need to know whether prompt/tool mutation happened before the call: `plugin.log`.
- Need lossless source for provider requests: `raw.jsonl` or raw `local-proxy-*.jsonl`.
- Need only one session: prefer the bakery over ad-hoc multi-file jq.

## Common mistake patterns

- Looking only at `local-proxy` for a daemon-side abort.
- Looking only at `daemon.log` when the real issue is the prompt or missing tool definition.
- Reading the full raw file before checking summary views.
- Treating the last request's missing assistant text as data loss, when it is simply a streaming-log
  limitation.
