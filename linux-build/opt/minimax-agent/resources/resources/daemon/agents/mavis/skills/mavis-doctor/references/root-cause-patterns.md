# Root Cause Patterns

Use this after you already have evidence. Do not start here.

## Patterns

### 1. “The session ended weirdly / answer missing”

- Evidence:
  `timeline.txt` shows a final streamed request; `conversation.txt` lacks the final assistant text;
  `daemon.log` may show abort/retry/recovery.
- Likely cause:
  streamed response body is not persisted in local-proxy, or daemon interrupted and retried.
- Next check:
  recover the previous assistant turn from the next request; search `daemon.log` for retry/abort.

### 2. “The model ignored the expected skill/tool”

- Evidence:
  `tools.json` does not contain the tool, or `plugin.log` shows transform/injection anomalies.
- Likely cause:
  tool was never exposed, or prompt/tool transform changed availability.
- Next check:
  compare `system.txt`, `tools.json`, and `plugin.log` for the same request window.

### 3. “Permission denied / command blocked / sandbox issue”

- Evidence:
  `conversation.txt` has tool-use attempts, `daemon.log` shows permission/sandbox/bridge lines.
- Likely cause:
  permission policy or sandbox gate blocked execution, not a model reasoning failure.
- Next check:
  correlate timestamps between tool-use blocks and daemon permission logs.

### 4. “Many sessions suddenly fail with 4xx/5xx”

- Evidence:
  `local-proxy` shows repeated non-200 statuses across sessions.
- Likely cause:
  upstream auth/rate-limit/provider incident, not one bad conversation.
- Next check:
  summarize failures by status/url/model before drilling into any single session.

### 5. “Session was bad from the start”

- Evidence:
  `conversation.first.txt` and `system.txt` already contain wrong context or bad instructions.
- Likely cause:
  initial prompt injection / memory / session bootstrap issue.
- Next check:
  inspect `plugin.log` and any bootstrap-time prompt transform.

### 6. “It got bad only later”

- Evidence:
  early requests look clean; a later turn introduces wrong context, bad tool result, or daemon event.
- Likely cause:
  tool-result contamination, mid-session retry/recovery, or user-driven context drift.
- Next check:
  diff the last two requests and inspect tool-result blocks around the first bad turn.

## Reporting discipline

Write conclusions like this:

- `Evidence`: cite exact artifact names and the specific signal.
- `Inference`: explain the narrowest interpretation supported by that evidence.
- `Uncertainty`: state what is still unproven.
- `Next action`: one confirming command or one concrete fix.
