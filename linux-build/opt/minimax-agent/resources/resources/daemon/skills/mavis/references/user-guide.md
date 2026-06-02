# User Guide

Use this doc when the user is asking how to use or configure **Mavis itself**. This is a routing
and quick-start layer: prefer the existing `mavis` references or a more specialized skill instead
of duplicating command details here.

## What Mavis is

Mavis is a self-hosted multi-agent runtime. It manages daemon lifecycle, agents, sessions, memory,
cron jobs, IM routing, skills, and team plans. The default data directory is `~/.mavis/`.

## Delegation Map

| User question | What to do |
| --- | --- |
| 添加新模型 / provider / API key | Edit `~/.mavis/config.yaml` provider section directly (see Config + Daemon Quick Guide below) |
| 接入新的 MCP server | Delegate to `mcp-onboarding` |
| 已有 MCP 的 list / tools / call / auth / sync | Delegate to `mcp-cli` |
| 飞书 / Lark 业务操作 | Delegate to `lark-tools` |
| 创建 / 改进一个 skill | Delegate to `skill-creator` |
| worktree / 分支开发流程 | Delegate to `worktree-management` |
| MR / CI / review gate | Delegate to `gitlab-mr-review` |
| 手动测试 / 验收测试 | Delegate to `manual-test` |
| 多 agent 协作 / Team Plan | Delegate to `mavis-team` skill |
| agent / session / memory / cron / IM 路由 | Read the matching `mavis` reference below |

## Read the Matching Mavis Reference

- agent / identity / logs / visible skills -> `references/agent.md`
- session lifecycle / communication -> `references/session-and-communication.md`
- memory scope / topic files / cleanup -> `references/memory.md`
- cron / self-reminder pattern -> `references/cron.md`
- IM route rules / defaults / bridge status -> `references/im.md`
- skill management -> `references/skill-management.md`

## Config + Daemon Quick Guide

Common entry points:

```bash
mavis config info -H          # port / dataDir / profile / git branch
mavis config show -H          # daemon runtime config
mavis config set <field> <value>
mavis config set-api-key <key>

mavis start
mavis start --no-web
mavis stop
mavis restart
mavis status -H
mavis daemon update [--tag latest|unstable]
```

For detailed command semantics, read the matching reference instead of duplicating it here:
- config + daemon basics -> this section + `references/cron.md` / `references/im.md` as needed
- agent details -> `references/agent.md`
- session / communication -> `references/session-and-communication.md`
- memory -> `references/memory.md`

Notes:

- config file is usually `~/.mavis/config.yaml`
- changing config affects new sessions; old sessions keep their existing runtime context until they rotate
- profile-specific data lives under `~/.mavis-<profile>/`

## User-Facing Execution Flow

When the user says “帮我配置 / 帮我修改 / 帮我加上 …”:

1. Match the capability to the right skill or `mavis` reference.
2. Explain what will be changed.
3. Ask for confirmation before destructive or write operations.
4. Execute the command.
5. Verify with `info` / `show` / `status` / `list` and tell the user when it takes effect.

## Scope Boundary

- Questions about using/configuring Mavis -> stay in `mavis`
- Questions about developing the Mavis codebase itself -> use repo docs / engineering skills instead

## Troubleshooting

| Symptom | Cause / Fix |
| --- | --- |
| `Mavis daemon is not running` | `mavis start`; or wrong profile — check `mavis config info -H` |
| `EADDRINUSE` on start | `lsof -i :5321` to find the occupier; or `mavis --port <other> start` |
| Version mismatch warning | Informational only — daemon keeps running; `mavis daemon update` to upgrade |
| Config / model change not taking effect | Old sessions keep old config; open a new session or `mavis session rotate --handoff-file <path>` |
| New model not in picker | Missing from `provider.<x>.whitelist` in config.yaml |
| Cron not firing | Check `mavis cron info <agent> <name>` — is it `enabled`? Are `active-hours` / timezone correct? |
| Feishu message hitting wrong agent | `mavis im route test ...` to simulate; adjust `priority` or add `--chat-id` |
| Long session is slow | `mavis session compress <sid>` or `mavis session rotate --handoff-file <path>` |
| Deeper issues (SQLite lock, harness error) | `mavis agent logs -n 500` for daemon logs |
