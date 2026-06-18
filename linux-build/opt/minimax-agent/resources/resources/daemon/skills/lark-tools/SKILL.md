---
name: lark-tools
description: >-
  Feishu/Lark full-capability access via the official `lark-cli` (terminal) plus minimal daemon
  endpoints for onboard and bot status. Use this skill whenever the user mentions anything
  related to Feishu or Lark, including but not limited to: checking today's schedule or a
  specific date's agenda, creating calendar events, querying free/busy status, viewing or
  creating tasks, searching group chats, reading chat history, sending or replying to messages,
  looking up contacts or user details, querying or writing Bitable (multi-dimensional table)
  records, searching documents, or running any lark-cli subcommand. Even if the user simply
  says "check my schedule", "send a message to someone", "find a doc about X", or "look up who
  Zhang San is", this skill applies. Also use it when encountering 401 / LARK_USER_AUTH_REQUIRED
  errors — this skill handles the auth flow.
descriptions:
  zh-Hans: "通过官方 lark-cli 使用飞书/Lark 全能力，包括日程、任务、消息、通讯录、文档和多维表格。"
---

# Feishu / Lark Tools

Run Feishu (Lark) operations by invoking the official `lark-cli` binary directly from the
terminal. Credentials live in the global `~/.lark-cli/` store, shared with the bound daemon
bot — no daemon proxy or per-bot HOME is needed.

The daemon still owns two responsibilities:
1. **App registration / bot binding** — minting a brand-new Feishu app and persisting its
   `appId` / `appSecret` into the global lark-cli store (optionally binding it to an agent).
2. **Bot status** — surfacing whether a bot is bound and whose user token is active.

User OAuth (UAT) is **not** a long-running daemon responsibility — but the daemon does
**auto-trigger one initial `lark-cli auth login --recommend`** at the end of onboard so the
fresh app immediately gets a UAT covering the recommended scope set (no manual second step).
Subsequent runtime increments (a high-sensitivity scope outside `--recommend`) are handled
by `lark-cli auth login --scope "..."` directly when an agent first hits a missing-scope
error.

Everything else (calendar, IM, base, docs, tasks, …) is a plain `lark-cli` invocation.

## Mandatory platform command router

`lark-cli` itself is cross-platform, but the **setup glue** in this skill (resolving the daemon URL from `daemon.port`, polling onboard status with `curl`, parsing JSON) is shell-specific. Before running any setup command, select exactly one platform command reference and use only that file's recipes.

Router:

1. Read `<agent-context>.platform`.
2. If `platform` is `win32`:
   - REQUIRED: read `references/commands-windows-powershell.md`.
   - Use PowerShell recipes from that file only (`ConvertFrom-Json`, `Invoke-RestMethod`, `Join-Path`, etc.).
   - Do NOT use bash snippets, `command -v`, `cat`, `sed`, or `jq` pipelines.
3. If `platform` is `darwin` or `linux`:
   - REQUIRED: read `references/commands-macos-linux.md`.
   - Use bash/zsh recipes from that file only.
4. If `platform` is missing or unknown:
   - Do a tiny preflight to identify the shell/platform before running anything.
   - If still unclear, ask the user which environment is running the command.

Never translate shell commands across platforms from memory. The platform reference files own every recipe for `install-lark-cli`, `resolve-daemon-url`, `bot-status`, `auth-status`, `onboard-start`, `onboard-poll`, and `onboard-cancel`. The body of this skill keeps the high-level flow; the reference files keep the platform-specific glue.

## Quick Start

0. **Ensure `lark-cli` is installed** — see [Install lark-cli](#install-lark-cli)
1. **Resolve the daemon URL** (once per session) — see [Resolve Daemon URL](#resolve-daemon-url)
2. **Check bot binding** — ensure a Feishu bot is connected to the agent
3. **Check user auth** — ensure the user has authorized via OAuth
4. **Run lark-cli** — see [Calling lark-cli](#calling-lark-cli) and the per-domain sub-skills

## Install lark-cli

`lark-cli` is the official Feishu/Lark CLI binary that this skill drives. It is **not** bundled
with mavis and is not installed by default — every later command in this skill assumes
`lark-cli` is on `$PATH`. **Always run the `install-lark-cli` recipe from the selected platform command reference first**; if missing, install it for the user before doing anything else.

The npm package is **`@larksuite/cli`** (provides the `lark-cli` binary). Do not guess other package names.

Notes:

- If the global install fails with a permission error, tell the user and offer either an elevated install (e.g. `sudo npm install -g @larksuite/cli` on macOS/Linux, or running PowerShell as Administrator on Windows) or a per-user prefix. **Never run `sudo` without telling the user first.**
- After install, do **not** run `lark-cli config init` — the daemon onboard flow
  (see [Bot Binding](#bot-binding)) populates the global lark-cli store directly.
- For upgrades after first install, see the update notice handling in
  `cli-skills/lark-shared/SKILL.md` (`npm update -g @larksuite/cli`).

## Resolve Daemon URL

Run this first in every session. The daemon port is dynamic, so hardcoding `localhost:5321`
will break when the port changes.

Use the `resolve-daemon-url` recipe from the selected platform command reference. It produces a single variable (`DAEMON_BASE` on bash; `$DaemonBase` on PowerShell) the rest of this skill can interpolate. The recipe reads `<dataDir>/daemon.port` first and falls back to `mavis status` parsing if the file is missing.

Always use the resolved base URL for the **onboard endpoints** below — `lark-cli` cannot drive
app-registration, so the daemon owns that one flow. Everything else (auth status, bot
binding check, calendar / IM / mail / …) goes through `lark-cli` directly, no HTTP call to
the daemon needed.

Note: all daemon API routes live under the `/mavis` base path, e.g.
`<DAEMON_BASE>/mavis/api/lark/onboard/start`. Calling `<DAEMON_BASE>/api/...` (without
the `/mavis` prefix) falls through to the SPA HTML and returns garbage HTML to your JSON
parser — do not strip the prefix.

## Bot Binding

Before any Feishu operation, verify that a Feishu bot is connected. Without a bot, the global
lark-cli store has no Feishu app credentials and `lark-cli api ...` cannot make API calls.

### Check connection status

Use the `bot-status` recipe from the selected platform command reference. It runs `lark-cli auth status` and parses the JSON result with the platform-native parser (`jq` on macOS/Linux, `ConvertFrom-Json` on PowerShell).

- **No output / no `appId`** — no app is bound, proceed to register a new bot below.
- **`appId` present, `identity: "bot"`** — bot is bound but the user has not authorized
  (or the UAT expired). Jump to [User Authentication](#user-authentication).
- **`appId` present, `identity: "user"`, `tokenStatus: "valid"`** — fully ready, proceed
  with the user's request. Check the `scope` field to confirm the requested operation's
  permission is included.

### Register a new bot — recommended one-click flow

The `/api/lark/onboard/*` endpoints drive **two** device flows back-to-back: first
**app-registration** (mints a brand-new PersonalAgent app + writes its `appId` / `appSecret`
into the global lark-cli store), then **user OAuth** with `lark-cli auth login --recommend`
(grabs the recommended scope set in one shot). The status field reports each phase so the
UI can show two separate QRs.

Use the `onboard-start` recipe from the selected platform command reference (it POSTs to
`<DAEMON_BASE>/mavis/api/lark/onboard/start` with `{"name":"main"}` and captures `sessionId`,
`verificationUriComplete`, `userCode`, `expiresIn`, `intervalSec`).

Present `verificationUriComplete` (and the `userCode`) to the user and ask them to scan with
the Feishu app to approve the new PersonalAgent app.

Use the `onboard-poll` recipe from the same reference to poll
`<DAEMON_BASE>/mavis/api/lark/onboard/status?sessionId=<id>` every `intervalSec` seconds.

The status field walks through:

1. `app_pending` — first QR (app-registration consent). Show
   `verificationUriComplete` + `userCode`.
2. `user_pending` — second QR (user OAuth with `--recommend`). Show
   `userVerificationUriComplete` + `userCode` (different from the app phase).
3. `done` — bot is bound, runner is live, and the user has a UAT covering the
   recommended scope set. No further action needed.

If the user only needs the bot identity (no user-side calls), `user_pending` can be skipped
by passing `{"skipUserAuth": true}` to `/api/lark/onboard/start`.

If the user closes the dialog or you want to abort, use the `onboard-cancel` recipe (POSTs
to `<DAEMON_BASE>/mavis/api/lark/onboard/cancel` with the captured `sessionId`).

When `status` becomes `done`, the daemon has written the global lark-cli config and the
encrypted appsecret + UAT under the OS-specific lark-cli storage directory (see
`references/storage-paths.md` for the per-OS table). Both app-level **and** user-level
`lark-cli` calls work immediately. **Only when an operation later requires a high-sensitivity
scope outside the recommended set** does an agent need to run `lark-cli auth login --scope "..."`
— see [User Authentication](#user-authentication) below.

If the request body includes `agentName`, the daemon also binds the freshly-minted
`(appId, appSecret)` to that agent's IM config and starts the channel-bridge plugin runner
in-process — the bot is live without restarting the daemon.

## User Authentication

User credentials live in the global lark-cli store, keyed by `(appId, userOpenId)` and
shared with the terminal `lark-cli`. The actual on-disk paths differ per platform — see
`references/storage-paths.md` for the per-OS table; this skill never assumes any specific
host OS path.

In mavis, the daemon onboard flow already runs `lark-cli auth login --recommend` once at
the end (see [Bot Binding](#bot-binding)) — the bound app starts with a UAT covering
the recommended scope set, no manual second step needed.

**Increments** happen lazily: when a specific call requires a scope the current UAT does
not have (a high-sensitivity scope outside `--recommend`), `lark-cli` prints the exact
`lark-cli auth login --scope "..."` invocation needed; rerun with that suggestion and the
new UAT is written into the same global store on success. Do **not** re-run `--recommend`
to "refresh" — it will pop another auth window for the user without adding any scope.

### Check auth status

Use the `auth-status` recipe from the selected platform command reference. It runs
`lark-cli auth status` and parses the JSON with `jq` (macOS/Linux) or `ConvertFrom-Json`
(PowerShell), returning the same `{appId, identity, userOpenId, userName, tokenStatus, scope, expiresAt}` shape.

If `identity == "user"` and `tokenStatus == "valid"` and the requested operation's scope
is in the `scope` field, auth is valid — proceed with the user's request. Otherwise run
`lark-cli auth login` (see [User Authentication](#user-authentication)).

To actually call the server (catches stale-but-not-yet-expired tokens), use
`lark-cli auth status --verify`. It returns the same JSON plus `verified: true|false`.

### Interop with the terminal `lark-cli`

Because the daemon writes and reads the same store as the official `lark-cli`:

- After daemon onboarding finishes, **both** the appsecret and a recommended-scope UAT are
  populated — the user can use the bot immediately, no terminal step required.
- After the user runs `lark-cli auth login --scope "..."` in the terminal to add an extra
  scope, the next daemon API call sees the freshly-issued UAT (and refreshes pick up new
  tokens written by `lark-cli`).
- `lark-cli config init` is **not** required — the daemon's app-registration flow already
  populates `apps[0]`.

## Calling lark-cli

**MANDATORY: Before running any `lark-cli` shortcut (`+messages-send`, `+chat-search`,
`+agenda`, etc.), you MUST Read the corresponding sub-skill reference file first.** The
examples below are just a starting point — they do NOT cover formatting caveats, content
flags (`--text` vs `--markdown` vs `--content`), or identity requirements. The reference
files contain critical details that, if missed, cause silent data loss (e.g. empty
messages, wrong format).

Use the Sub-Skills Index below to find the right reference file for each shortcut.

Once auth is in place, invoke `lark-cli` directly. Use `--as user` for personal resources
(calendar / drive / tasks) and `--as bot` for application-level operations (inbound IM /
event subscribe). The per-domain sub-skills under `cli-skills/` document concrete command
syntax; the cheat sheet below is just a starting point.

```bash
# Generic OpenAPI passthrough (works for any documented Feishu endpoint)
lark-cli api GET  /open-apis/contact/v3/users/<user_id> --as user
lark-cli api POST /open-apis/im/v1/messages --as bot --params '{"receive_id_type":"chat_id"}' --data '{...}'

# Calendar — today's agenda + create event
lark-cli calendar +agenda --as user --format json
lark-cli calendar +create --as user --summary "Team Sync" --start 2026-04-01T14:00 --end 2026-04-01T15:00

# IM — search chats, list messages, send / reply
lark-cli im +chat-search          --as user --query "周报" --format json
lark-cli im +chat-messages-list   --as user --chat-id oc_xxx --format json
lark-cli im +messages-send        --as bot  --chat-id oc_xxx --markdown "Hello"
lark-cli im +messages-reply       --as bot  --message-id om_xxx --markdown "Reply"

# Task / Base / Contact — same pattern
lark-cli task    +get-my-tasks    --as user --format json
lark-cli base    +record-list     --app-token bascnXXX --table-id tblXXX --format json
lark-cli contact +search-user     --as user --query "张三" --format json
```

Most subcommands print JSON when you pass `--format json`; pipe to `jq` to extract
fields. A few commands print JSON unconditionally (e.g. `lark-cli auth status`,
`lark-cli auth list`) — no `--format` flag needed for those.

**Multi-bot environments** — when multiple bots are bound, pass `--as user --app-id <appId>`
(or use `lark-cli auth use <appId>` to switch the default) to disambiguate. With a single
bot, the only entry in `apps[]` is auto-selected.

## Sub-Skills Index (Load on Demand)

Each entry maps to `cli-skills/<name>/SKILL.md`. **Before using any sub-skill, you MUST first
Read `cli-skills/lark-shared/SKILL.md`** — it covers the cross-cutting basics (identity
selection, scope concepts, permission-denied handling, security rules) and now aligns with
the mavis flow described above (daemon owns app-registration **and** auto-runs
`lark-cli auth login --recommend` at the end of onboard; runtime increments use
`--scope`, never `--domain`).

**Then Read the specific sub-skill's reference file** for the shortcut you're about to use
(e.g. `cli-skills/lark-im/references/lark-im-messages-send.md` before calling `+messages-send`).
Do NOT rely on the quick examples above — they omit critical formatting and content-flag details.

| Scenario keywords | Sub-skill | Path |
|-------------------|-----------|------|
| Calendar / agenda / meeting room / free-busy / RSVP | lark-calendar | `cli-skills/lark-calendar/SKILL.md` |
| Tasks / todos / lists / assignments | lark-task | `cli-skills/lark-task/SKILL.md` |
| Send/receive messages / group chats / chat history / upload-download images & files | lark-im | `cli-skills/lark-im/SKILL.md` |
| Contacts / find people / lookup open_id / departments | lark-contact | `cli-skills/lark-contact/SKILL.md` |
| Create / edit / read Feishu cloud documents | lark-doc | `cli-skills/lark-doc/SKILL.md` |
| Drive file management / upload-download / import docs / comments | lark-drive | `cli-skills/lark-drive/SKILL.md` |
| Spreadsheet read/write / export | lark-sheets | `cli-skills/lark-sheets/SKILL.md` |
| Bitable / Base / fields / records / views | lark-base | `cli-skills/lark-base/SKILL.md` |
| Wiki / knowledge base / space members / nodes | lark-wiki | `cli-skills/lark-wiki/SKILL.md` |
| Slides / PPT create and read | lark-slides | `cli-skills/lark-slides/SKILL.md` |
| Whiteboard | lark-whiteboard | `cli-skills/lark-whiteboard/SKILL.md` |
| Whiteboard CLI advanced ops | lark-whiteboard-cli | `cli-skills/lark-whiteboard-cli/SKILL.md` |
| Email send/receive / drafts / rules / attachments | lark-mail | `cli-skills/lark-mail/SKILL.md` |
| Video conference history / recordings | lark-vc | `cli-skills/lark-vc/SKILL.md` |
| Minutes list / download / AI artifacts | lark-minutes | `cli-skills/lark-minutes/SKILL.md` |
| Approval instances / tasks | lark-approval | `cli-skills/lark-approval/SKILL.md` |
| Attendance / clock-in records | lark-attendance | `cli-skills/lark-attendance/SKILL.md` |
| Real-time event subscription (WebSocket) | lark-event | `cli-skills/lark-event/SKILL.md` |
| Find native un-wrapped OpenAPI | lark-openapi-explorer | `cli-skills/lark-openapi-explorer/SKILL.md` |
| Custom Skill authoring | lark-skill-maker | `cli-skills/lark-skill-maker/SKILL.md` |
| Bulk meeting minutes processing | lark-workflow-meeting-summary | `cli-skills/lark-workflow-meeting-summary/SKILL.md` |
| Agenda + todo standup digest | lark-workflow-standup-report | `cli-skills/lark-workflow-standup-report/SKILL.md` |
| Shared base (identity / scope / safety rules) | lark-shared | `cli-skills/lark-shared/SKILL.md` |

**Loading examples**:
- User: "Show me today's schedule" → Read `cli-skills/lark-shared/SKILL.md` + `cli-skills/lark-calendar/SKILL.md`
- User: "Add a row to the Bitable" → Read `cli-skills/lark-shared/SKILL.md` + `cli-skills/lark-base/SKILL.md`

---

## Tips

- **Multi-bot environments** — when multiple bots are bound, disambiguate with
  `--app-id <appId>` (or `lark-cli auth use <appId>`). With one bot, it is auto-selected.
- **401 / LARK_USER_AUTH_REQUIRED** — the user's OAuth token is missing or expired. If the
  daemon onboard flow ran `--recommend` already, the UAT should be present; if it expired,
  re-run `lark-cli auth login --recommend` (one-shot, recommended scope set). If a specific
  call needs an **extra** scope outside `--recommend`, `lark-cli` itself prints the exact
  `lark-cli auth login --scope "..."` invocation to use; rerun with that suggestion. **Do
  not use `--domain`** — it is per-domain and forces the user through a separate auth
  window for each module they touch.
- **Bitable requires tokens from the URL** — you need the `appToken` (from the table URL)
  and `tableId` (from `lark-cli base +table-list`).

## Windows note on cli-skills examples

The per-domain reference files in `cli-skills/` (lark-mail, lark-whiteboard, lark-slides, etc.)
show bash heredoc patterns like `cat > file << 'EOF'` for writing JSON payloads. On Windows:

- Use the **Write tool** (preferred) to write JSON content to a file, then pass the file path to
  `lark-cli`.
- Or use PowerShell with a multi-line here-string (the `@'` and `'@` tokens must each be on their
  own line):
  ```powershell
  @'
  {"key": "value"}
  '@ | Set-Content -Path ./patch.json -Encoding UTF8
  ```
- Or wrap in `bash -c "cat > file << 'EOF' ... EOF"` if Git Bash is available.

The `lark-cli` binary itself is cross-platform and works identically in both PowerShell and bash.
