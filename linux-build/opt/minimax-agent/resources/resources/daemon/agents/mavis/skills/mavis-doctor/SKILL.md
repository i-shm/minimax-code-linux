---
name: mavis-doctor
description: >-
  Debug why a session/agent/daemon behaved incorrectly. Load when user mentions a session id (ses_/mvs_*),
  wants logs, root-cause analysis, or asks about stuck runs, retries, permissions, or recovery.
  Keywords: 排查, 调试, 卡住, 为什么, log, debug, inspect, retry, recovery.
descriptions:
  zh-Hans: "排查 session、agent 或 daemon 行为异常，分析日志、卡住、重试、权限和恢复问题。"
---

# Mavis Doctor

## Session ID 双前缀

Mavis 有两层 session ID：

| 前缀 | 来源 | 用于 |
|------|------|------|
| `mvs_` | Daemon 生成（`SessionService.createSession`） | Daemon API / UI / DB 主键 (`sessions.session_id`) |
| `ses_` | OpenCode 框架返回 | Proxy log header (`X-Mavis-Session-Id`)、OpenCode 进程内部 |

映射关系存储在 `<dataDir>/sqlite.db` 的 `sessions` 表：
- `session_id` = `mvs_...`（主键）
- `framework_session_id` = `ses_...`（可为 NULL，lazy session 未 provision 时）

> **路径约定**: `<dataDir>` 取自 `<agent-context>` 中的 `dataDir` 字段。
> 所有下述命令中的 `<dataDir>` 都必须替换为该实际值（例如 macOS/Linux 的 `~/.mavis`，Windows 的 `%USERPROFILE%\.mavis`）。

## Platform compatibility

mavis-doctor 的工具链（`sqlite3`、`jq`、`bash` install.sh、本地 proxy recipes）默认面向
macOS/Linux/WSL。在 Windows 上：

- `sqlite3` CLI 不是系统自带，需要先 `winget install SQLite.SQLite` 或 `scoop install sqlite`。
- `jq` 不是系统自带，可以 `winget install jqlang.jq` / `scoop install jq`，或者改用
  `ConvertFrom-Json`。
- 内置的 `install.sh` / `mavis-session-log` 节是 Bash 脚本，仅在 macOS/Linux/WSL/Git Bash
  里可执行；Windows 原生 PowerShell 必须显式调用 `bash` 兼容层（WSL、Git Bash、MSYS2）才能
  使用 bakery script。否则 fall back 到本节末尾的 manual `jq`/`Select-String` 路径。

下列 SQLite 查询本身是跨平台的（`sqlite3` 接受标准 SQL），只要二进制装好。

### 从 mvs_ 查 ses_（用于在 proxy log 中搜索）

```bash
sqlite3 <dataDir>/sqlite.db "SELECT framework_session_id FROM sessions WHERE session_id = 'mvs_xxx'"
```

### 从 ses_ 查 mvs_（用于关联 daemon API 层面的 session）

```bash
sqlite3 <dataDir>/sqlite.db "SELECT session_id FROM sessions WHERE framework_session_id = 'ses_xxx'"
```

### 列出最近的映射

```bash
sqlite3 -header <dataDir>/sqlite.db "SELECT session_id, framework_session_id, title, created_at FROM sessions ORDER BY created_at DESC LIMIT 20"
```

## Route

- `ses_...` 或 `mvs_...`, one bad session, "查本轮": read `references/session-playbook.md`
- prompt / messages / token usage / latest-turn diff / cross-session keyword search: read `references/local-proxy-recipes.md`
- no session id, daemon-wide / startup / recovery / routing / plugin / runtime symptom: read `references/global-triage.md`
- already have artifacts, need symptom → cause mapping: read `references/root-cause-patterns.md`
- unsure where the truth lives: read `references/log-surfaces.md`

## Session bakery bootstrap

The bakery script (`mavis-session-log`) is a Bash entry point. Run it from
**macOS/Linux/WSL/Git Bash**:

```bash
command -v mavis-session-log >/dev/null \
  || bash <dataDir>/agents/mavis/.builtin-skills/mavis-doctor/install.sh

mavis-session-log --data-dir <dataDir> <ses_id_or_mvs_id>
```

The bakery script accepts both `ses_` and `mvs_` prefixed IDs. When given a `mvs_` ID, it automatically resolves the corresponding `ses_` ID from the SQLite DB and searches proxy logs with it.

`--data-dir` **must** be passed explicitly — the script defaults to `~/.mavis/` which is wrong for non-default profiles.

If `~/.mavis/bin` is unavailable, call the script directly:

```bash
<dataDir>/agents/mavis/.builtin-skills/mavis-doctor/bin/mavis-session-log --data-dir <dataDir> <ses_id_or_mvs_id>
```

On native Windows PowerShell (no WSL/Git Bash), do not try to invoke `install.sh` directly.
Either run the same commands from a Bash-compatible shell, or skip ahead to the manual
`jq`/`Select-String` fallback below.

### Bakery failure fallback

If the bakery script fails (e.g. "no framework_session_id found", "no entries for session"), **do not give up on local-proxy logs**. Fall back to manual `jq`:

1. Resolve the `ses_` ID manually via SQLite (see above).
2. Read `references/local-proxy-recipes.md` for ready-made `jq` recipes.
3. Run `jq` directly against `<dataDir>/logs/local-proxy-*.jsonl`.

This fallback is **mandatory** — local-proxy logs are the richest source of LLM trace data. Do not skip them just because the bakery failed.

## Hard rules

- If a `ses_` or `mvs_` id exists, start with the bakery command before custom `jq`.
- For bakery output, read `README.md` then `timeline.txt` before raw files.
- Never `cat` huge files (`raw.jsonl`, large `conversation.txt`, full hourly logs); use `grep`, `sed`, `head`, `tail`.
- Absence in local-proxy is not proof of absence in daemon behavior; daemon-only failures often live in `daemon.log` / `plugin.log`.
- Last streamed assistant text is usually missing from `respBody`; recover it from the next request when needed.
- Prefer artifact-producing workflows over one-off shell archaeology when follow-up analysis is likely.
- When given a `mvs_` ID, always resolve to `ses_` before searching proxy logs — proxy logs only contain `ses_` IDs in the `x-mavis-session-id` header.

## Output contract

- `Scope`: session / daemon / plugin / local-proxy / uncertain
- `Evidence`: concrete files, timestamps, statuses, tool calls, log lines
- `Conclusion`: narrowest supported cause
- `Next action`: smallest confirming or fixing step

If you used the bakery, return artifact paths, not only prose.

## Windows (win32) platform notes

The bakery script (`bin/mavis-session-log`) and `install.sh` are bash scripts. On Windows, invoke
them via **Git Bash**:

```powershell
# Install the bakery command
bash install.sh

# Run the bakery
bash bin/mavis-session-log mvs_abc123def456
bash bin/mavis-session-log --data-dir "$env:USERPROFILE\.mavis" ses_xyz789

# Manual jq fallback (if bakery fails)
bash -c 'jq -c --arg sid ses_xyz '\''select(.headers["x-mavis-session-id"] == $sid)'\'' "$HOME"/.mavis/logs/local-proxy-*.jsonl'
```

**Additional tool requirements on Windows:**

| Tool | Required for | Install |
|---|---|---|
| `jq` | Bakery + manual fallback | `winget install jqlang.jq` |
| `sqlite3` | Resolving `mvs_` → `ses_` IDs | `winget install SQLite.SQLite` |

After install, refresh PATH:
```powershell
$env:PATH = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path','User')
```

The grep/sed/head/tail commands in `references/session-playbook.md` all work inside `bash -c "..."`.

**If Git Bash or any tool is missing**, read the `mavis` skill's
`references/windows-tool-bootstrap.md` for the full detection + auto-install table.
