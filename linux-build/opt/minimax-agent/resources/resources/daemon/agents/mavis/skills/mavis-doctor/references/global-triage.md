# Global Triage

Use this when there is **no session id yet**, or the symptom sounds broader than one session:

- daemon failed to start
- many sessions failed at once
- routing / recovery / permission logic looks wrong
- plugin injection issue
- opencode runtime issue

## Triage order

1. Identify the narrowest failing surface.
2. Read the newest relevant logs first.
3. Search for errors and warnings before reading long spans.
4. Only drill into one subsystem at a time: daemon, plugin, opencode, or local-proxy.

## Primary surfaces

### Daemon text logs

```bash
ls -t ~/.mavis/logs/daemon-*.log | head
rg -n 'ERROR|WARN|abort|recovery|permission|bridge|listen|port' ~/.mavis/logs/daemon-*.log
tail -n 200 ~/.mavis/logs/daemon-*.log
```

Use for: startup, recovery, session bridge, permission checks, routing, profile/port issues.

### Plugin logs

```bash
ls -t ~/.mavis/logs/plugin-*.log | head
rg -n 'ERROR|WARN|prompt|tool|inject|transform|session' ~/.mavis/logs/plugin-*.log
```

Use for: system prompt mutation, tool injection, session env propagation.

### Opencode logs

```bash
ls -t ~/.mavis/logs/opencode-*.log | head
rg -n 'ERROR|WARN|spawn|crash|health|timeout|session' ~/.mavis/logs/opencode-*.log
```

Use for: runtime crashes, unhealthy adapter child, startup/health failures.

### Local-proxy logs

```bash
rg -n '"status":(4|5)' ~/.mavis/logs/local-proxy-*.jsonl
```

Use for: upstream HTTP errors, prompt/tool exposure, request duration, token usage.

## Global questions and where to look

| Question | First place |
|---|---|
| “Daemon didn't start / attach / listen correctly” | `daemon-*.log` |
| “Permission or sandbox behavior is wrong” | `daemon-*.log`, then session artifacts |
| “Prompt/tool injection seems wrong across sessions” | `plugin-*.log`, then local-proxy |
| “Provider or model API is failing” | `local-proxy-*.jsonl` |
| “Adapter child crashed or became unhealthy” | `opencode-*.log`, `daemon-*.log` |

## Good search patterns

```bash
rg -n 'ERROR|WARN' ~/.mavis/logs/daemon-*.log ~/.mavis/logs/plugin-*.log ~/.mavis/logs/opencode-*.log
rg -n 'recovery|resume|abort|interrupted|permission|sandbox' ~/.mavis/logs/daemon-*.log
rg -n 'prompt|transform|inject|tool' ~/.mavis/logs/plugin-*.log
rg -n 'health|spawn|crash|timeout|exit' ~/.mavis/logs/opencode-*.log
```

## Escalate to session-level when

- you discover a concrete `ses_` id in a text log
- the failure is reproducible for one specific conversation
- you need to inspect the actual prompt/messages/tools seen by the model

At that point switch to `session-playbook.md` and run `mavis-session-log <ses_id>`.
