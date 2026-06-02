# Local Proxy Recipes

Use this file when you need direct `jq` against `~/.mavis/logs/local-proxy-*.jsonl` instead of the
`mavis-doctor` session bakery output (`mavis-session-log`).

## Use this for

- prompt inspection
- latest-turn diff
- token usage
- cross-session search
- internal non-session calls
- custom filtering not worth adding to the bakery output

## Facts that matter

- Proxy logs record `ses_` (framework) IDs in `headers."x-mavis-session-id"`, not `mvs_` (daemon) IDs. If the user provides a `mvs_` ID, resolve it first (see below).
- `headers."x-mavis-session-id"` exists only on agent session calls.
- `messages` are cumulative; the last request contains the full prior conversation.
- Streaming calls store `sseChunks`, not the streamed text body.
- `respBody` is a JSON string; parse with `fromjson`.
- The assistant reply for request `N` is usually recoverable from request `N+1`'s messages.

## Recipes

### Resolve mvs_ to ses_ (required before proxy log queries)

```bash
sqlite3 ~/.mavis/sqlite.db "SELECT framework_session_id FROM sessions WHERE session_id = 'mvs_xxx'"
```

### Resolve ses_ to mvs_ (for cross-referencing with daemon API)

```bash
sqlite3 ~/.mavis/sqlite.db "SELECT session_id FROM sessions WHERE framework_session_id = 'ses_xxx'"
```

### List all sessions

```bash
jq -r 'select(.headers."x-mavis-session-id") | [.ts, .headers."x-mavis-session-id", .headers."x-mavis-agent-id", .reqBody.model, (.reqBody.messages | length)] | @tsv' ~/.mavis/logs/local-proxy-*.jsonl | sort -u
```

### Get system prompt for one session

```bash
jq -r 'select(.headers."x-mavis-session-id" == "SESSION_ID") | .reqBody.system[0].text' ~/.mavis/logs/local-proxy-*.jsonl | head -1
```

### Show full accumulated conversation for one session

```bash
jq -s '[.[] | select(.headers."x-mavis-session-id" == "SESSION_ID")] | last | .reqBody.messages[] | {role, content: [.content[] | if .type == "text" then {type, text: (.text | .[0:500])} elif .type == "tool_use" then {type, name: .name, input_preview: (.input | tostring | .[0:200])} elif .type == "tool_result" then {type, content_preview: (.content | tostring | .[0:200])} elif .type == "thinking" then {type, text: (.text | .[0:300])} else {type} end]}' ~/.mavis/logs/local-proxy-*.jsonl
```

### Show only the latest incremental turn

```bash
jq -s '[.[] | select(.headers."x-mavis-session-id" == "SESSION_ID")] | if length < 2 then last.reqBody.messages else (.[-2].reqBody.messages | length) as $prev | last.reqBody.messages[$prev:] end | .[] | {role, types: [.content[] | .type], texts: [.content[] | select(.type == "text") | .text[:500]]}' ~/.mavis/logs/local-proxy-*.jsonl
```

### Recover prior assistant output from the next request

```bash
jq -s '[.[] | select(.headers."x-mavis-session-id" == "SESSION_ID")] | to_entries[] | select(.key > 0) | {ts: .value.ts, recovered_from_previous_turn: .value.reqBody.messages[-2:]}' ~/.mavis/logs/local-proxy-*.jsonl
```

Interpretation: the next request often includes the prior assistant turn in its cumulative
`messages`, so this is the best available recovery method for streamed output.

### Timeline with timing and usage

```bash
jq -r 'select(.headers."x-mavis-session-id" == "SESSION_ID") | [.ts, (.durationMs | tostring) + "ms", .reqBody.model, (.reqBody.messages | length | tostring) + " msgs", (if .respBody then (.respBody | fromjson | .usage | "\(.input_tokens)in/\(.output_tokens)out") else "stream(\(.sseChunks)chunks)" end)] | @tsv' ~/.mavis/logs/local-proxy-*.jsonl
```

### Errors only

```bash
jq 'select(.status != 200) | {ts, status, session: .headers."x-mavis-session-id"?, url, error: (.respBody | fromjson? | .error? // .respBody[:500])}' ~/.mavis/logs/local-proxy-*.jsonl
```

### Token usage summary per session

```bash
jq -s '[.[] | select(.respBody and .headers."x-mavis-session-id") | {session: .headers."x-mavis-session-id", usage: (.respBody | fromjson | .usage)}] | group_by(.session) | .[] | {session: .[0].session, calls: length, total_input: [.[].usage.input_tokens] | add, total_output: [.[].usage.output_tokens] | add}' ~/.mavis/logs/local-proxy-*.jsonl
```

### Internal non-session calls

```bash
jq -r 'select(.headers | not) | [.ts, .reqBody.model, (.reqBody.system[0].text[:80])] | @tsv' ~/.mavis/logs/local-proxy-*.jsonl
```

### Search keyword across sessions

```bash
jq -r 'select(.headers."x-mavis-session-id") | . as $root | .reqBody.messages[] | .content[]? | select(.type == "text" and (.text | test("KEYWORD"; "i"))) | [$root.ts, $root.headers."x-mavis-session-id", .text[:200]] | @tsv' ~/.mavis/logs/local-proxy-*.jsonl
```

## Usage discipline

- For big files, avoid `-s` unless you need cross-entry comparison.
- Truncate long text aggressively during first-pass analysis.
- Use the bakery when the user cares about one session's full story, not just one field.
