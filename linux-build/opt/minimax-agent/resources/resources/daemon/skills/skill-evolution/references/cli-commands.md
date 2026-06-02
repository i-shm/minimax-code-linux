# CLI Commands

> Quick reference for `mavis skill signal` and `mavis skill proposal`. For
> field semantics see [signal-rubric.md](signal-rubric.md) and
> [proposal-rubric.md](proposal-rubric.md).

## Signals

```bash
# File a new signal
mavis skill signal report \
  --skill <skillRef> \                                # omit for missing-skill
  --issue-kind <kind> \                                # required
  --evidence "<excerpt ≤200>" \                        # required
  [--attribution <type>] \                             # recommended
  [--rationale "<text ≤1000>"]                         # recommended

# Cancel / dismiss
mavis skill signal cancel --signal-id sig_abc123

# List
mavis skill signal list                                # JSON by default
mavis skill signal list -H                             # human-readable table
mavis skill signal list --verdict pending --limit 10
```

`<kind>`: `outdated | contradiction | missing-step | wrong-trigger | missing-skill | other`

`<type>`: `skill_issue | missing_skill | environment | user_preference | unknown`
(NOT `agent_error` — that's an agent mistake, don't file)

## Proposals

```bash
# File a new proposal
mavis skill proposal report \
  --name <kebab> \                                     # required, kebab-case
  --scope <s> \                                        # required
  --summary "<one-line>" \                             # required
  --rationale "<text>" \                               # required
  [--sketch "<outline>"] \                             # optional but encouraged
  [--evidence "<exc1>"] [--evidence "<exc2>"] [--evidence "<exc3>"] \
  [--target-agent <name>]                              # required when --scope agent

# Cancel / dismiss
mavis skill proposal cancel --proposal-id pro_abc123 [--reason "<text>"]

# Mark acted (used by nightly skill-creator after creating the skill)
mavis skill proposal mark-acted --proposal-id pro_abc123 --skill-ref global:my-new-skill

# Inspect a single proposal
mavis skill proposal info --proposal-id pro_abc123

# List
mavis skill proposal list                              # JSON by default
mavis skill proposal list -H                           # human-readable table
mavis skill proposal list --verdict pending
mavis skill proposal list --agent mavis --channel session-fallback
```

`<s>`: `agent-self | agent | global | user-global | project-main`

`<channel>`: `session-fallback | memory-cleanup | manual | active`

## Identity injection

Both `signal report` and `proposal report` automatically pick up the originating
session/agent from environment variables set by the runtime:

- `__MAVIS_PARENT_SESSION_ID` → fills `source.sessionId`
- `__MAVIS_PARENT_AGENT_NAME` → fills `source.agentName`

When run from a plain terminal (no env vars), both default to `'unknown'`.
You don't need to pass them explicitly.

## Common shapes

### "Skill X gave me wrong instructions"
```bash
mavis skill signal report \
  --skill <ref> \
  --issue-kind outdated \
  --attribution skill_issue \
  --evidence "<quote of the wrong line, plus what actually happened>" \
  --rationale "<why it's wrong>"
```

### "I needed a skill but couldn't find one"
```bash
mavis skill signal report \
  --issue-kind missing-skill \
  --attribution missing_skill \
  --evidence "<what I tried, what was missing>" \
  --rationale "<the unmet need>"
```

### "This session reveals a reusable new skill"
```bash
mavis skill proposal report \
  --name <kebab> \
  --scope agent-self \
  --summary "<one-liner>" \
  --rationale "<pattern + recurrence + audience>" \
  --sketch "<5-15 line outline>" \
  --evidence "<transcript excerpt>"
```
