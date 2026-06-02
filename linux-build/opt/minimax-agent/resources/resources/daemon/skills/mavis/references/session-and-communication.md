# Session And Communication

Use this doc for session lifecycle and inter-session messaging. Sessions are runtime work units;
communication is how sessions report, escalate, and coordinate.

## Core Split

- `mavis session ...` manages session lifecycle
- `mavis communication ...` moves messages between sessions

Do not try `mavis session send` or `mavis session message` for outbound messaging — those
commands do not exist. Use `mavis communication send`.

If delegation requires structured produce/verify orchestration, use `mavis team plan` instead of
manually creating a worker pattern here.

## Session Commands

```bash
mavis session list [agentId]
mavis session ls [agentId]
mavis session info <sessionId>
mavis session update <sessionId> [--title <title>] [--workspace <path>]
mavis session messages <sessionId> [--limit <n>] [--before <cursor>]
mavis session msg <sessionId>
mavis session rotate --handoff-file <path> [--reason <reason>]
mavis session close <sessionId>
mavis session abort <sessionId>
```

Important outputs:

- `info`: session ID, agent, title, workspace, type, framework, created/updated timestamps
- `messages`: role, timestamp, message ID, content preview, tool calls

Rotation rule (rotate v2): use `mavis session rotate` when context quality degrades or the main
session is too large. The rotate flow is **synchronous and requires a handoff file** —
`--handoff-file <path>` is mandatory. The path must point to an existing, non-empty markdown file
≤ 1 MB; the daemon ingests it as the kick-off context for the new session and archives the old
one. Typical pattern when the model itself decides to rotate (or after `<context-pressure>` fires):

```bash
# 1. write a concise handoff to a temp file (Goal / Progress / Modified Files / Key Decisions /
#    Open Questions / Next Steps)
# 2. then call rotate with the path
mavis session rotate --handoff-file /tmp/handoff.md --reason context_pressure
```

If you cannot write the handoff yourself (e.g. you are an external trigger such as the UI rotate
button or an automation), call `POST /api/agent/:name/session/:sessionId/request-rotation`
instead — the daemon will SR-prompt the owning session to write the handoff and call
`mavis session rotate` for you.

## Session Status Semantics

Five states (`SessionStatus` in `packages/daemon/src/agent/framework-adapter/types.ts`).
Status is a state label — `sendMessage` does not gate on it. Sends fail only when the CLI process is gone.
In particular, `finished` means idle after a turn, **not closed**. A finished session can still
receive `mavis communication send` / `SessionBridge.sendMessage` and resume work.

| Status | Set by | Process alive? | Send |
|--------|--------|----------------|------|
| `started` | bridge before each turn | yes | accepted (queued / preempts per source-lock) |
| `finished` | bridge on terminal event | yes | accepted |
| `interrupted` | daemon-restart F002 recovery | yes | accepted |
| `aborted` | `mavis session abort` | yes (abort = interrupt request, not kill) | accepted |
| `error` | bridge on `session.error` | maybe | likely fails — check logs |

`aborted` vs `interrupted`: same effect, different trigger (user vs recovery).
Process killed via `stopSession` is surfaced as `finished` with no distinct status.

## Communication Commands

```bash
mavis communication send --to <sessionId> --command prompt --content "..."
mavis communication peers
mavis communication messages --to <sessionId>
mavis communication messages --from <sessionId>
```

`mavis communication send` is valid for sessions whose status is `finished`; do not route around a
finished session just because it looks inactive.

Runtime context provides your session ID, parent session ID, root session ID, and reachable peers.

## Communication Scope

Sessions form a tree. You can talk to:

- your parent session
- your sibling sessions
- other root sessions if you are root

## Required Pattern: Report Back

When delegated work finishes or blocks, proactively message the assigning session.

```bash
mavis communication send \
  --to "$PARENT_SESSION_ID" \
  --command prompt \
  --content "Task complete. Result: ..."
```

Do not wait to be asked. This is the normal completion path.

## Large Payload Rule

Do not inline large blobs. Write them to scratchpad and send only path + summary. Warnings start
around 8KB; >50KB auto-overflows to attachments.

## Use This Doc When

- you need session history, lifecycle, or rotation
- you need to reply to a parent or root session
- you need to inspect peers or message audit trails
