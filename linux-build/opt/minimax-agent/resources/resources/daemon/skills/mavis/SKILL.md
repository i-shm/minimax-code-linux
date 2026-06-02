---
name: mavis
description: "Mavis runtime entry point. Use this skill for any task about Mavis itself. Trigger when: user asks how to configure or use Mavis, list/inspect/create/update agents, inter-session messaging (use `mavis communication`, not `mavis session`; `finished` means idle/routable, not closed), rotate a session, choose between user/agent/project memory (session memory is removed), schedule a self-reminder while waiting on CI/jobs/batch/human reply, manage hooks (inspect/create/test/delete), control how Feishu or Telegram routes to agents, install or inspect skills, or hot-edit a built-in skill. Also trigger on keywords: mavis agent, mavis session, mavis memory, mavis cron, mavis hook, mavis im, mavis skill, rotate session, report back to parent, set a reminder, wait for CI. Sub-references to read for each subproblem: user-guide, agent, session-and-communication, memory, cron, hook, im, skill-management, skill-evolution."
---

# Mavis

Mavis is Mavis itself: the agent runtime, coordination layer, and operating surface behind agents,
sessions, memory, scheduled work, inbound chat routing, and skill maintenance. This skill is the
entry point for operating that system.

## Capability Map

| Area | What it covers | Read when you need |
| --- | --- | --- |
| `user-guide` | User-facing Mavis usage / configuration questions, daemon basics, config entry points, delegation map | answer “怎么配置 Mavis / Mavis 支持什么 / xxx 怎么用” |
| `agent` | Agent inventory, config, identity, logs, status, visible skills | inspect or update an agent; discover what an agent can use |
| `session-and-communication` | Session lifecycle, message history, main-session rotation, inter-session messaging, peer discovery, report-back patterns | inspect sessions; send results to parent/main; track delegated work |
| `memory` | User / agent / project memory, topic files, cleanup model, what belongs where; session memory is removed | write memory correctly; read or structure long-term memory |
| `cron` | Scheduled tasks, self-reminders, active-hours gating, IM delivery, polling slow operations | wait for CI/jobs/human replies without blocking; run recurring checks |
| `hook` | Hook registry inspection, creation, update, deletion, dry-run testing, event payloads, gating semantics | inspect or modify Mavis hooks; test tool/session gates; explain where hook files live |
| `im` | Feishu / Telegram bridge status, route rules, defaults, session strategy selection | control how inbound chats map to agents and sessions |
| `skill-management` | Skill inventory, visibility, installation, file-level create/update/delete/copy, source/runtime locations | list, inspect, install, or manage skill files |
| `skill-evolution` | Built-in skill editing rules, attribution, conservative patching, diff checklist, push-failure handling | update a built-in Mavis skill from runtime signals |

## Read Map

- Need user-facing “怎么用 / 怎么配置 Mavis” questions, daemon basics, or delegation to a more specialized skill -> `references/user-guide.md`
- Need agent inspection, status, logs, identity, or skill discovery -> `references/agent.md`
- Need session lifecycle, inter-session messaging, parent report-back, or peer discovery -> `references/session-and-communication.md`
- Need to decide whether something belongs in session / agent / user memory -> `references/memory.md`
- Need recurring checks, delayed follow-up, or a self-reminder for async work -> `references/cron.md`
- Need hook registry CLI commands, hook file shape, event payloads, matchers, or dry-run testing -> `references/hook.md`
- Need to route Feishu or Telegram inbound traffic to the right agent/session strategy -> `references/im.md`
- Need to list, inspect, install, create/update/delete/copy skill files -> `references/skill-management.md`
- Need to edit a built-in skill from evolution signals without bloating or damaging it -> `references/skill-evolution.md`

## Mandatory platform command router

`mavis` itself is cross-platform, but the worked examples in this skill (multi-line `--content` arguments, environment-variable interpolation, command substitution) are shell-specific. Before running any of the example commands, select exactly one platform command reference:

1. Read `<agent-context>.platform`.
2. If `platform` is `win32`:
   - REQUIRED: read `references/commands-windows-powershell.md`.
   - Use PowerShell recipes from that file only (here-strings with `@'…'@`, `$env:VAR`, `Select-String`, etc.).
   - Do NOT use bash snippets, single-quoted multi-line strings with `$VAR` interpolation, `cat`, or `2>/dev/null`.
3. If `platform` is `darwin` or `linux`:
   - REQUIRED: read `references/commands-macos-linux.md`.
   - Use bash/zsh recipes from that file only.
4. If `platform` is missing or unknown:
   - Do a tiny preflight to identify the shell/platform before running anything.
   - If still unclear, ask the user which environment is running the command.

The body of this skill stays neutral. Concrete shell recipes (`agent-inspect`, `report-back-to-parent`, `cron-poll-ci`, `cron-reminder`, `hook-list`, `hook-test`, `memory-append`) live in the platform reference files and pick up environment variables (`PARENT_SESSION_ID`, `agentName`, `CURRENT_SESSION_ID`) the right way for that platform.

## Minimal Examples

For each example below, copy the matching recipe from the selected platform command reference (`commands-macos-linux.md` or `commands-windows-powershell.md`):

- `agent-inspect` — inspect an agent and its visible skills (`mavis agent info <name>` and `mavis skill list <name>`)
- `report-back-to-parent` — send a completion or progress note to your parent session via `mavis communication send`
- `cron-poll-ci` — schedule a self-reminder to poll CI (`mavis cron self`)
- `cron-reminder` — schedule a user-requested reminder (default `new` mode, no session context needed)
- `hook-list` — list hooks for an agent
- `hook-test` — dry-run a hook with a sample tool input/output payload
- `memory-append` — append knowledge to an agent's memory file

Do not paste raw bash strings into PowerShell or vice versa. Both reference files emit the same `mavis …` invocations; only the surrounding shell glue differs.

## Rule

Do not treat Mavis as an external business system. If the task is about operating or using Mavis
itself, start here, then read only the reference doc matching the current subproblem.

Do not create a second routing skill for Mavis usage/configuration questions. Add or adjust a
`mavis` reference instead, so this skill remains the single routing entry point for Mavis itself.
