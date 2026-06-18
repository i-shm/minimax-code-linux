# Memory

Mavis memory has three durable layers plus task-local artifacts. The core decision is
not "should I save this" but "which scope does this belong to".

## Decision Rule

Pick the narrowest durable scope that still helps future work. Same three-question test
the `<memory-skill-reminder>` system block injects, **narrowest first**:

1. **Only true in this repo/project?** → **Project memory**
   `AGENTS.md` / `CLAUDE.md` (every agent, every task) or referenced topic files (on demand).
2. **Still true on a different project?** → **Agent memory**
   Reusable lessons private to this agent: patterns, gotchas, future-task leverage.
3. **Would the conclusion change for a different user?** → **User memory**
   Identity, preferences, communication style, persistent cross-project facts about the user.

If none fits → **task-local** (workspace / scratchpad / plan board / final report).
Pick exactly one durable layer; do not duplicate across layers. Your `agentName` and
`sessionId` are available in `<agent-context>`.

### `--user` requires `--reason`

`mavis memory append --user` rejects any append without
`--reason "<one sentence cross-project justification>"`. This catches the most common
failure mode: writing project methodology into user memory because `--user` is the most
convenient flag. If you can't justify the entry across every project this user works
on, it belongs in layer 1 or 2 — not user memory.

The reason is persisted as `<!-- mem-append-reason: ... -->` directly above the
appended content for future audit. CLI rejects empty `--reason` locally; daemon
enforces the same rule as the authoritative gate.

## What NOT to Put in Durable Memory

Apply this filter **before** writing. Skip the write or keep it task-local if any apply:

- code structure recoverable from the repo: paths, signatures, architecture notes
- git facts: diffs, blame, commit history, who changed what
- debugging recipes or repair steps that belong in code, MR context, or docs
- standing policy already captured in `AGENTS.md` / `CLAUDE.md`
- transient task state: current branch, handoff scraps, in-flight progress
- raw activity logs, PR lists, work journals — extract the non-obvious lesson instead
- project-level architectural constraints that apply to all agents/developers
  → write to **project memory**, not agent memory (agent memory is private)

When a user asks to save a list, extract the durable bit: the rule, surprise,
constraint, or pointer.

## Layer Commands

### Project memory (no CLI)

Edit `AGENTS.md` / `CLAUDE.md` (one usually symlinks to the other; every agent reads it
on every task) or a referenced topic file directly with Edit/Write, update
`changelogs/`, commit alongside related code.

Placement:
- Mandatory for every task (e.g. "never merge to main directly") → `AGENTS.md`
- Domain-specific (e.g. "daemon seal pattern") → topic file, referenced from `AGENTS.md`

### Agent memory

Reusable lessons **private to this agent** across sessions. Patterns, gotchas, future-task leverage.

```bash
mavis memory append <agent-name> --content '### <topic> (<date>)
Type: <type>
<content>
WHY: <why this matters later>'
```

Replace `<agent-name>` with your actual `agentName` from `<agent-context>`.

### User memory

User identity, preferences, communication style, persistent cross-project facts about the user.
`--reason` is required (see above).

```bash
mavis memory append --user \
  --reason '<one sentence: why does this hold across all projects?>' \
  --content '### <topic> (<date>)
Type: <type>
<content>'
```

To **modify, correct, or remove** an existing entry, edit the memory file directly with
Edit/Write — `append` doesn't dedupe and would produce duplicates. Files: user
`~/.mavis/memory/user.md`, agent `~/.mavis/agents/<agent-name>/memory/MEMORY.md`
(or `<topic>.md`), project the file in the repo.

## Type Tag

User/agent entries need a `Type:` line as the first content line under the
`### <topic> (<date>)` header. The cleanup curator relies on it.

```text
### MR notification flow (2026-05-08)
Type: feedback
CI + CR must pass before asking the user to merge...
```

Three Types:

- **user** — how this user thinks and works: role, goals, preferences, knowledge level
- **feedback** — how Mavis should behave next time. Save both corrections *and* validated
  judgments; if you only remember mistakes you become weirdly timid.
  Shape: rule → **Why:** → **Apply when:**
- **reference** — where to look outside the repo: docs, dashboards, tickets, runbooks

If unsure: "how the agent should act" → **feedback**; otherwise re-apply the
decision rule above.

## Topic Files

Agent memory has two forms:

- `MEMORY.md`: injected when `memory.enabled` is true; hot rules, current state,
  frequently triggered discipline
- `memory/<topic>.md`: on-demand topics with YAML `description`; read when description
  matches the current task

```bash
mavis memory write-topic <agent-name> <kebab-name> --description "When to read this" --content "..."
mavis memory write-topic <agent-name> <kebab-name> --description "..." --file ./topic.md
mavis memory list-topics [agent-name]
mavis memory read-topic <agent-name> <name>
mavis memory delete-topic <agent-name> <name>
```

Constraints (cleanup curator auto-rebalances; don't count size manually):

- max 10 topic files per agent
- each topic ≤ 30KB
- `MEMORY.md` soft target ≤ 15KB, hard limit 20KB
- do not maintain a manual topic index in `MEMORY.md`

## Cleanup

Automatic: daily 05:00 UTC+8, write-hook when `MEMORY.md` crosses the threshold,
or manual `mavis memory cleanup <agent-name>` (`--force` bypasses dedup window).
The curator rebalances `MEMORY.md` and topics, archives prior state under
`memory/archive/<date>/`, and ends. Don't manually curate.

Set `memory.enabled=false` to stop prompt injection, reminders, automatic cleanup,
daily digest updates, and Mavis memory writes. Existing files remain readable via
show/search/list/read commands.

## Treat Recalled Memory as a Hint

Memory helps you orient; it does **not** prove what is true right now. Before leaning
on a memory record:

- if it names a file / path / function / command / flag / endpoint, verify it still exists
- if the user asks about "current" / "latest" / "recent", prefer code, git, runtime
  state, and current docs over recalled snapshots
- if the user may act on your recommendation, verify first
- if memory conflicts with what you see now, trust the current source of truth and
  update or delete the stale memory

`memory says X existed` ≠ `X exists now`.

## Daily Digest

Optional and **disabled by default**. When enabled (daemon config), yesterday's sessions
get written to `~/.mavis/agents/{name}/daily/{YYYY-MM-DD}.md` at 04:00 UTC+8 and
injected as a `<daily_digest>` block. When disabled, don't look for that block;
write durable lessons directly to the right layer above.

## Quick Reference

```bash
# Write
mavis memory append --user --reason '<cross-project rationale>' \
  --content '### <topic> (<date>)\nType: user\n<content>'
mavis memory append <agent-name> \
  --content '### <topic> (<date>)\nType: feedback\n<content>'
mavis memory write-topic <agent-name> <topic-name> --description "..." --content "..."
# UPDATE = edit the file directly (append doesn't dedupe).

# Read
mavis memory show <agent-name>
mavis memory show --user
mavis memory search <keyword> <agent-name>
mavis memory list-topics <agent-name>
mavis memory read-topic <agent-name> <topic-name>

# Maintain
mavis memory cleanup <agent-name>
mavis memory delete-topic <agent-name> <topic-name>
```

## The Habit

1. **Start of session:** when `memory.enabled` is true, memories are auto-injected.
   Topics show as descriptions only — read when the description matches your task.
2. **During work:** when you learn something, write immediately. Three-question test,
   narrowest first: project → agent → user. If none fits, keep it task-local.
3. **Before reporting completion:** pause. Did you learn anything reusable? Write it now.
