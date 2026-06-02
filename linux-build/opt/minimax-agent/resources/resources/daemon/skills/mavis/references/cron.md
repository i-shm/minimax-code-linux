# Cron

Cron is the only way to wait on slow external state without holding the current turn.
Two use cases: **agent self-polling** (CI / batch / human ack) and **user-facing recurring**
tasks (reminders, digests).

## Pick a command

| Need | Command |
|---|---|
| Agent self-polls while working a task | `mavis cron self` |
| User-facing recurring (reminder, digest, alarm) | `mavis cron create` |

Decision rule: *Did the user ask for it?* → `cron create`. *I'm waiting on something
while working?* → `cron self`. "Remind me to wake up at 8am" is the user asking — use
`cron create`, not `cron self`.

## `mavis cron self` — self-reminder shorthand

```bash
mavis cron self [name] --every <interval> --prompt "<text>" \
                       [--ttl <duration|never>] [--no-quiet-on-skip] [--timezone <tz>]
```

```bash
# Poll CI every 5 min, exit silently when still running, auto-cleanup after 14d.
mavis cron self check-ci --every 5m \
  --prompt "Check CI for MR !1666. Pass → report and exit. Fail → summarize and exit. Running → do nothing."
```

Daemon auto-injects everything you'd otherwise have to remember:

| Auto-injected | Source |
|---|---|
| `--session-mode sessionId --session-id $MAVIS_SESSION` | env var (OpenCode plugin sets it) |
| Agent name | resolved from session |
| Cron expression | parsed from `--every` |
| `name` (when omitted) | auto-generated `watch-<6hex>` |
| `report_to_root: false` | receiving session handles the prompt directly |
| TTL self-cleanup snippet | appended to prompt |
| Silence-on-skip gate-discipline reminder | appended to prompt |

### `--every <interval>`

Natural-language duration or raw cron expression:

| Form | Examples | Resolves to |
|---|---|---|
| Sub-minute | `30s`, `15s` | `*/30 * * * * *` (6-field) |
| Minute | `5m`, `1m` | `*/5 * * * *` |
| Hour | `1h`, `2h` | `0 * * * *`, `0 */2 * * *` |
| Day | `1d`, `7d` | `0 0 * * *`, `0 0 */7 * *` |
| Compound | `1h30m`, `2d12h` | Rounded down to closest cron grid |
| Raw cron | `*/5 * * * *`, `0 9 * * *` | Pass-through |

Intervals of thumb: CI 3-5 min · batch 5-10 min · humans 1-2 h.

### `--ttl <duration|never>`

Default `14d`. Hard maximum `30d` (HTTP 400 above) — a forever-running self-reminder is
almost always a forgotten cleanup, not a real requirement. `--ttl never` opts out; the
prompt still carries a "delete when reason is gone" note. Use sparingly.

The TTL snippet appended to the prompt reads
`If Date.now() > <expiresAtMs>, mavis cron delete <agent> <name>` — the **receiving
session** enforces it at the next tick after expiry, no separate daemon clock. If the
cron never fires after expiry (e.g. agent paused), the snippet just sits there until
something runs it.

### `--no-quiet-on-skip`

By default the receiving session writes its skip-tick status as a `<mavis-progress>...</mavis-progress>`
block (visible to the user when they look, but **does not** light up an unread
notification) and exits — no IM, no plain chat reply. `--no-quiet-on-skip` opts out and
lets the session message the user on every tick — almost always wrong.

## `mavis cron create` — full form

```bash
mavis cron create <agent> <name> --schedule "<expr>" --prompt "<text>" [flags]
```

Use this whenever `cron self`'s envelope is too narrow: `new`-mode session per tick,
IM delivery, business-hours active windows, custom schedules, or any user-initiated
reminder.

```bash
mavis cron create main daily-digest \
  --schedule "0 9 * * *" --active-hours "09:00-18:00" \
  --deliver-channel feishu-bot --deliver-chat <chatId> \
  --prompt "Generate the daily digest..."
```

### Flags (create / update)

| Flag | Notes |
|---|---|
| `--schedule <expr>` | Cron expression |
| `--timezone <tz>` | IANA name |
| `--prompt <text>` | Prompt body |
| `--session-mode <mode>` | `new` (default) · `sessionId` · `root` (legacy `main` accepted, normalized to `root`) |
| `--session-id <id>` | Required when mode=`sessionId` |
| `--active-hours <HH:MM-HH:MM>` | Pass `none` on update to clear |
| `--deliver-channel <name>` + `--deliver-chat <chatId>` | IM delivery |
| `--no-delivery` | Disable delivery |
| `--enable` / `--disable` | Toggle |

`update` needs at least one flag.

## Session modes

| Mode | When | Behavior |
|---|---|---|
| `new` (default) | User-initiated reminder, recurring report | Fresh session per tick. Result auto-reports to agent root via `report_to_root: true` (legacy field `report_to_main` still accepted on read; daemon writes `report_to_root`). |
| `sessionId` | Agent self-polls while working a task | Runs in a specific existing session. Pass `MAVIS_SESSION` (OpenCode plugin auto-injects). Use `cron self` — it's the ergonomic shorthand. **Never use `new` for polling**: a fresh session has no task context. |
| `root` | Worker (non-primary) agent default | Runs in agent root session. Legacy alias `main` accepted on read, normalized to `root`. New configs should write `root`. |

`mavis cron self` always sets `report_to_root: false` — the receiving session handles
the prompt directly, a second report would be noise.

## Other commands

```bash
mavis cron list    <agent>
mavis cron info    <agent> <name>   # name, schedule, tz, status, next/last run, prompt
mavis cron trigger <agent> <name>   # fire once now
mavis cron run     <agent> <name>   # alias of trigger
mavis cron enable  <agent> <name>
mavis cron disable <agent> <name>
mavis cron delete  <agent> <name>   # alias: rm
mavis cron update  <agent> <name> [flags]
```

## Notes

- Cron tasks are per-agent.
- `mavis cron self` is backed by the same `CronRegistry` as `cron create` — not a
  replacement, just the recommended shorthand for self-reminder polling.
- Delivery sends the completed response to IM after agent execution; without it, the
  result stays in session / web UI.
