# Session Playbook

Use this when the user gives a specific Mavis session id: `ses_[A-Za-z0-9]+` or `mvs_[A-Za-z0-9]+`.

## Session ID mapping

Proxy logs use `ses_` (framework) IDs in the `x-mavis-session-id` header. Daemon API/UI uses `mvs_` (daemon) IDs. The bakery script accepts both — given a `mvs_` ID, it resolves to `ses_` automatically via the SQLite DB.

If you need to manually resolve:

```bash
# mvs_ → ses_
sqlite3 ~/.mavis/sqlite.db "SELECT framework_session_id FROM sessions WHERE session_id = 'mvs_xxx'"

# ses_ → mvs_
sqlite3 ~/.mavis/sqlite.db "SELECT session_id FROM sessions WHERE framework_session_id = 'ses_xxx'"
```

## Standard flow

```bash
command -v mavis-session-log >/dev/null \
  || bash ~/.mavis/agents/mavis/.builtin-skills/mavis-doctor/install.sh

mavis-session-log <ses_id_or_mvs_id>
```

Then read in this order:

1. `README.md`
2. `timeline.txt`
3. only the narrowest answering file below

## Artifact map

| Question | File | Signal |
|---|---|---|
| overall chronology | `timeline.txt` | status / duration / model / turn count |
| what the model saw this turn | `conversation.txt` | last request, human-readable |
| was context bad from birth | `conversation.first.txt` | first request only |
| what system/tools were exposed | `system.txt`, `tools.json` | ground-truth model input |
| provider failure | `errors.jsonl`, `summary.jsonl` | non-200 entries, full failed request |
| daemon interference | `daemon.log` | recovery / bridge / abort / permission / routing |
| plugin mutation | `plugin.log` | prompt transform / token injection |
| runtime child events | `opencode.log` | spawn / crash / adapter-level clues |
| lossless source | `raw.jsonl` | original local-proxy entries |

## Symptom drills

### stopped early / interrupted / weird retry

- Read `timeline.txt` for repeated short requests, long gaps, or error bursts.
- Search `daemon.log` for `abort|interrupted|retry|recovery|StreamChunkThreshold`.
- If the last assistant text is missing, recover it from the next request or inspect `raw.jsonl` narrowly.

### wrong answer / ignored expected skill

- Read `conversation.txt` and `system.txt`.
- Check `tools.json` to verify the tool existed.
- Search `plugin.log` for prompt/tool mutation.
- Compare `conversation.first.txt` vs `conversation.txt` to separate bad bootstrap from later drift.

### only latest turn / 本轮

- Do not read the full accumulated conversation first.
- Use the incremental-diff recipe from `local-proxy-recipes.md` or compare the last two requests.

### permission / command blocked / tool oddness

- Search `conversation.txt` for `TOOL_USE` / `TOOL_RESULT` around the failure.
- Search `daemon.log` for `permission|deny|approve|sandbox|bridge`.
- Confirm tool availability in `tools.json`.

### slow / expensive session

- Read `timeline.txt` first.
- Use `summary.jsonl` or `local-proxy-recipes.md` for usage / duration filters.
- Separate provider latency from daemon-side retries or recovery.

## Safe inspection

```bash
DIR="${TMPDIR:-/tmp}/mavis-session-log/<ses_id>"

cat "$DIR/README.md"
cat "$DIR/timeline.txt"
grep -nE '^════' "$DIR/conversation.txt" | head -50
sed -n '1,200p' "$DIR/conversation.txt"
grep -nC5 'TOOL_USE:' "$DIR/conversation.txt"
jq 'select(.status >= 400)' "$DIR/summary.jsonl"
grep -E 'ERROR|WARN|abort|recovery|permission' "$DIR/daemon.log"
```

## Context discipline

- Never `cat` `raw.jsonl`, large `conversation.txt`, or full hourly logs.
- Read summaries before raw files.
- Treat `daemon.log` as authoritative for daemon-side behavior.
- Remember streamed assistant output is not stored in local-proxy response bodies.

## Hand back to user

At minimum, return:

```xml
<media type="file" src="<DIR>/conversation.txt" caption="<ses_id> 完整对话" />
<media type="file" src="<DIR>/raw.jsonl" caption="<ses_id> 原始日志（lossless）" />
```

If the diagnosis depends on server behavior, mention `daemon.log` explicitly in the conclusion.
