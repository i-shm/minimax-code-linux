# Hook

Use this doc for Mavis hook registry inspection, hook file CRUD, dry-run testing, event payloads,
matchers, and gating semantics.

## Commands

### List hooks

```bash
mavis hook list
mavis hook ls
```

Flags:

- `--agent <name>` loads global hooks plus hooks scoped to that agent
- `--human` prints a table; default output is JSON

Output fields:

- `id`: global hooks use `<fileName>`; agent hooks use `<agentName>:<fileName>`
- `hookEvent`: event name such as `PreToolUse`
- `agentName`: omitted or `*` means global
- `priority`: lower runs first
- `matcher`: regex used to filter the event-specific match value

### Show details

```bash
mavis hook info <id>
mavis hook info mavis:tool-guard --human
```

Use this before editing. It shows the resolved file path, frontmatter fields, body, and whether the
hook is built in. Built-in hooks are inspectable but cannot be updated or deleted through the CLI.

### Create hooks

```bash
mavis hook create tool-guard \
  --event PreToolUse \
  --type script \
  --agent mavis \
  --priority 10 \
  --matcher '^bash$' \
  --timeout 30000 \
  --body '```bash
node ./tool-guard.js
```'
```

Body sources:

- `--body <text>` embeds the hook body directly
- `--file <path>` reads the body from a file

Scope:

- omit `--agent` for a global hook under `<dataDir>/hooks/`
- pass `--agent <name>` for an agent hook under `<dataDir>/agents/<name>/hooks/`

Hook files are Markdown with frontmatter. Script hooks must contain a fenced `bash`, `shell`, or
`sh` block. Prompt hooks use the Markdown body as an LLM template.

### Update hooks

```bash
mavis hook update <id> --priority 20 --matcher '^read$'
mavis hook update <id> --file ./new-hook-body.md
```

Only specify fields that should change. Available fields:

- `--event <hookEvent>`
- `--type script|prompt`
- `--priority <n>`
- `--matcher <regex>`
- `--timeout <ms>`
- `--body <text>` or `--file <path>`

### Delete hooks

```bash
mavis hook delete <id>
mavis hook rm <id>
```

Deletion removes the hook file from disk. It does not apply to built-in hooks.

### Dry-run one hook

```bash
mavis hook test mavis:tool-guard \
  --input '{"agentName":"mavis","sessionId":"ses_123","toolName":"bash","toolArgs":{"command":"git status"}}' \
  --output '{"toolArgs":{"command":"git status"},"metadata":{}}'
```

`--input` and `--output` must be valid JSON. The result includes:

- `output`: hook-mutated output object
- `aborted`: whether the hook set `_abort`
- `abortReason`: reason from `_abort.reason`
- `executedCount`
- `errors`: isolated hook errors

## Hook File Shape

````markdown
---
hookEvent: PreToolUse
type: script
priority: 10
matcher: "^bash$"
timeout: 30000
---

```bash
node ./tool-guard.js
```
````

Frontmatter:

- `hookEvent`: required event name
- `type`: `script` or `prompt`; harness-style `bash` is parsed as `script`
- `priority`: optional, default `100`; lower runs first
- `matcher`: optional regex; `*`, empty, or omitted matches all
- `timeout`: optional milliseconds, default `30000`

Script protocol:

- Mavis passes `{"input": ..., "output": ...}` to the command on stdin
- the command prints a JSON object to stdout
- printed fields are merged into `output`
- empty stdout or invalid JSON keeps the original output
- non-zero exit, timeout, or thrown errors are isolated and logged; later hooks still run

Prompt protocol:

- template variables: `{{input}}`, `{{output}}`, `{{agent}}`, `{{sessionId}}`
- the LLM response must be valid JSON, optionally wrapped in a code fence
- parsed fields are merged into `output`

## Events

| Event | Trigger | Common use |
| --- | --- | --- |
| `SessionStart` | session creation | workspace gating; session metadata setup |
| `SessionEnd` | session termination | cleanup; summaries; audit |
| `UserPromptSubmit` | prompt submission before agent processing | prompt filtering; audit; rewrite |
| `PreToolUse` | before a framework tool call | tool permission; argument rewrite; model-aware policy |
| `PostToolUse` | after a framework tool call | result redaction; result enrichment; audit |

Additional bridge-layer types exist in code (`MessageComplete`, `StreamChunk`,
`StreamChunkThreshold`) but the stable CLI-facing workflow is the event set above. Check current
adapter wiring before relying on bridge-layer events.

## Matchers

For tool events, the matcher is evaluated against `toolName` unless `/api/hooks/execute` receives an
explicit `matchValue`. For daemon-native events, only use a matcher when the caller supplies a known
match value; otherwise omit it.

Use precise regexes:

- `^bash$` for exactly one tool
- `^(bash|edit|write)$` for a small allow/deny set
- omit `matcher` when every invocation should run

## Gating

Hooks gate an operation by writing `_abort` into output:

```json
{
  "_abort": {
    "reason": "Blocked by workspace policy"
  }
}
```

After each hook, the registry checks `_abort`. If present, the chain stops and the caller receives
`aborted: true` plus `abortReason`.

## Event Payloads

### SessionStart

Input:

```json
{
  "agentName": "mavis",
  "sessionId": "ses_123",
  "sessionType": "Main",
  "workspaceDir": "/repo",
  "parentSessionId": "ses_parent"
}
```

Output:

```json
{
  "workspaceDir": "/repo",
  "sessionType": "Main",
  "metadata": {}
}
```

### SessionEnd

Input:

```json
{
  "agentName": "mavis",
  "sessionId": "ses_123",
  "reason": "finished"
}
```

Output:

```json
{
  "metadata": {}
}
```

### UserPromptSubmit

Input:

```json
{
  "agentName": "mavis",
  "sessionId": "ses_123",
  "prompt": "user text"
}
```

Output:

```json
{
  "prompt": "possibly rewritten text",
  "metadata": {}
}
```

### PreToolUse

Input:

```json
{
  "agentName": "mavis",
  "sessionId": "ses_123",
  "toolName": "bash",
  "toolCallId": "call_123",
  "toolArgs": {
    "command": "git status"
  },
  "model": "provider/model"
}
```

Output:

```json
{
  "toolArgs": {
    "command": "git status"
  },
  "metadata": {}
}
```

### PostToolUse

Input:

```json
{
  "agentName": "mavis",
  "sessionId": "ses_123",
  "toolName": "read",
  "toolCallId": "call_123",
  "toolArgs": {
    "filePath": "/repo/README.md"
  },
  "toolResult": "original result"
}
```

Output:

```json
{
  "metadata": {},
  "toolResult": "optional replacement or enrichment"
}
```

Adapter note: OpenCode can apply returned `toolArgs` and `toolResult` through the plugin proxy.
Claude Code can gate tool use and sends `PostToolUse.toolResult` through additional context rather
than replacing the original result in place. Codex hook support is isolated through session-level
`CODEX_HOME/hooks.json`; confirm current adapter behavior before assuming result rewriting.

## Designing Testable Hooks (string-pattern PreToolUse hooks)

A `PreToolUse` hook on `^bash$` that pattern-matches `toolArgs.command` will block its own
dry-run: `mavis hook test <hook> --input '{...,"command":"<pattern>..."}'` — the outer bash
command literal contains the pattern as a string inside `--input`, so the hook aborts the
wrapper before the test ever runs. Symptom: abort reason on stdout/stderr instead of dry-run
JSON, no `--output` file.

Required design: every such hook must include a two-way escape hatch at the top of its body.

```js
const cmd = String(((payload.input || {}).toolArgs || {}).command || '');
if (/(^|\s)<HOOK_NAME>_SKIP=1\b/.test(cmd) || /#\s*<hook-name>:skip\b/.test(cmd)) {
  process.stdout.write('{}'); process.exit(0);
}
```

Validation flow: outer `<HOOK_NAME>_SKIP=1 mavis hook test ...` to let the wrapper through;
inner `--input` payload omits the hatch so production-equivalent pattern checks fire. Test
both directions (should-block blocks, should-pass passes). The hatch also serves as the
production safety valve for genuine edge cases without deleting the hook.

Hooks matching file-arg tools (`^(edit|write)$` etc.) or session events have no
self-interception and need no escape hatch.

## Use This Doc When

- you need to inspect or edit hook registry state
- you need to create a gate around a tool or session action
- you need to test hook behavior without waiting for a real session event
- you need to explain where hooks live and how they are matched
