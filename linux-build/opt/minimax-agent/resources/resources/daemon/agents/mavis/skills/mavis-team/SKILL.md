---
name: mavis-team
description: >
  Run a parallel team plan AND/OR create the agents you need to do it. Two intertwined entry points:
  (1) Execute a complex task with the existing roster — splits into parallel tracks, verifier
  judges each deliverable, you decide accept/retry. Use when the task has genuine parallel value
  (3+ independent tracks), needs independent verification, spans multiple sources/tools, or has
  high error cost. (2) Routing for "build me a team for X" / "add an agent for Y" / "组个团队搞 Z" /
  "拉一个 verifier 帮忙审 W" — if the existing roster can't cover the task, this skill decides
  whether to create new agents (with user consent for implicit needs, direct creation for
  explicit asks) and calls `create-agent` to do the writing. Per-domain deep dives live in
  references/software-engineering.md (code changes) and references/deep-research.md (multi-source
  investigation). Skip for single-step low-complexity tasks you can finish yourself.
---

# Mavis Team

Your entry point for two things that actually go together:

1. **Run a parallel plan** with the existing agents (`developer` / `tester` / `code-reviewer` / your project's experts), verifier judges each deliverable.
2. **Decide whether to create new agents** if the roster is missing what you need — call `create-agent` to do the writing.

## ⚠️ Hard rule — user-facing strings follow the user's language

`plan.name`, every task `title`, the `message_to_user` field in decisions, and
any free-form prose you put in `prompt` / `verify_prompt` that the user will
later see verbatim **must be written in the same language the user is using
in this session**. Default to English ONLY when the user has not produced any
inferrable language signal (greetings, fresh chat with no prior turn). Do not
default to English because the codebase, agent name, or your own training
data is English.

Bad (user is speaking Chinese):
- `plan.name: 'unify auto/default permission pipeline + comprehensive tests'`
- `tasks[].title: 'fix the title language regression'`

Good (user is speaking Chinese):
- `plan.name: '统一 auto/default 权限管线 + 完整测试'`
- `tasks[].title: '修复权限计划标题语言'`

The exact technical tokens (`auto`, `default`, file paths, schema field
names) MAY stay in their original form — what must follow the user's
language is the surrounding prose, the verb, and the noun describing what
the task delivers.

This rule applies to EVERY example in `references/software-engineering.md`
and `references/deep-research.md`. Those examples ship in English purely
because the skill itself is authored in English; treat them as templates
for STRUCTURE, not for output language. Translate the YAML strings into
the user's language before submitting.

## Triggers

Run a plan when ANY:
- Genuine parallel value (3+ independent tracks).
- Adversarial verification matters (security / data-flow / permission code, factual claims, calculations, external delivery).
- Multi-stage delivery chain (research → analyze → write).
- User said "team" / "组个团队" / "build me an agent" / explicitly named you.

First-class scenarios — MUST read the reference BEFORE writing the plan:
- **Software engineering** (cross-component code, refactor / migration, gated delivery) → `references/software-engineering.md`
- **Deep research** (multi-source, 3+ angles, formal synthesis) → `references/deep-research.md`

## Mandatory platform command router

This skill intentionally keeps executable shell recipes OUT of `SKILL.md`. Before you run any command for this skill, select exactly one platform command reference and use only that file's recipes.

Router:

1. Read `<agent-context>.platform`.
2. If `platform` is `win32`:
   - REQUIRED: read `references/commands-windows-powershell.md`.
   - Use PowerShell recipes from that file only.
   - Do NOT use bash snippets, `$WORKSPACE/...`, `mkdir -p`, `cat <<EOF`, `/tmp`, `.sh`, or `python3` assumptions.
3. If `platform` is `darwin` or `linux`:
   - REQUIRED: read `references/commands-macos-linux.md`.
   - Use bash/zsh recipes from that file only.
4. If `platform` is missing or unknown:
   - Do a tiny preflight to identify the shell/platform before writing or launching a plan.
   - If still unclear, ask the user which environment is running the command.

Never translate shell commands across platforms from memory. If a step needs shell features (write a YAML/JSON file, create a directory, join paths, use a temp directory, or invoke scripts), copy the pattern from the selected platform reference. Keep business logic in this skill; keep executable command recipes in the platform reference files.

## Step 1 · Get ready

Five questions — answer in your head from current context. If any is unclear, do a tiny preflight (read a file, check a schema, query a system) yourself before writing the plan. This is NOT a team task.

1. What is the real objective and concrete deliverable?
2. Why does this need a team instead of you doing it directly?
3. What are the natural, non-overlapping work packages?
4. Which sources / tools / agents does each package need?
5. What should the verifier independently re-derive (not re-read producer's work)?
6. For research plans: what depth level, evidence retention, and final-report scale would make the
   result worth the user's waiting time? If unclear, read `references/deep-research.md` and set an
   explicit deliverable contract before launching.

## Step 2 · Pick agents — or create the ones you need

Check `<agent-context>` first (it may carry `availableAgents` and active peer sessions). Otherwise use the platform-specific `list-agents` and `list-peers` recipes from the command reference you selected above.

If the existing roster fits:
- Prefer a project-specific agent over a generic one with the same role.
- Use `general` for one-off work when no specialist exists.
- Use the **exact agent name** from output, not a display name.
- Multiple tasks can share the same agent (engine spawns separate sessions).

### If no existing agent fits

Two paths — pick by **how the user phrased the request**:

**Implicit need** (user gave a task, you discovered mid-planning the roster is missing a role).

Creating an agent is sticky — registry space, routing weight, awkward to clean up. A plan is throwaway. So **stop and ask**:

1. Pause planning.
2. Report: which task is blocked, which existing agent comes closest, the 1–2 new agents you'd recommend (each: `name`, one-line `description`, scope, stop condition).
3. Wait for explicit user OK. Do NOT call `create-agent` until they say yes.
4. After consent → load `create-agent` and follow it for each new agent.
5. Resume planning with the new names in `assigned_to`.

**Explicit ask** (user said "build me a team for X" / "add an agent for Y" / "组个团队搞 X").

Consent already given. But still review names before writing files:

1. Draft the agent list (each: `name`, one-line `description`, scope, stop condition).
2. Show the list to the user — names + descriptions only — and ask for any edits.
3. Once names are settled → load `create-agent` for each one.
4. Continue with the plan that uses them.

### Team-design checklist (when proposing new agents)

| Choice | Default |
|---|---|
| Total team size | 3–7 max. Beyond → overlap and routing confusion. |
| Coding project always has | `developer` + `tester`. Add `code-reviewer` for high quality bar. |
| Domain specialists | 1–4, named by **responsibility** (`payments-expert`, `db-expert`), NEVER by seniority (`senior-dev`). |
| Stop condition style | Concrete + measurable ("tests pass, MR opened"), NEVER vibe ("user is happy"). |
| Don't | Add a "PM" rein (orchestrator already coordinates) · Clone roles (`developer-1`/`-2`) · Pad "in case" |

## Step 3 · Write the plan

Software engineering plan examples → `references/software-engineering.md`. Deep research → `references/deep-research.md`. General example:

```yaml
version: 1
plan:
  name: 'quarterly operations review package'
  max_concurrency: 10
  max_consecutive_failures: 2
  max_cycles: 10
  verifier_config:                    # plan-level defaults; see Step 3.5
    default_verifiers: [verifier]      # used when a task omits verified_by
    audit_sample_rate: 0.0             # leave at 0 unless user opts in
tasks:
  - id: data-collection
    title: 'collect metrics from multiple sources'
    prompt: '<extract KPIs from spreadsheets, pull meeting summaries from Lark, gather project status>'
    assigned_to: general
    verified_by: verifier
    verify_prompt: '<verify numbers match source documents, no stale data>'
    timeout_ms: 1800000
  - id: analysis
    title: 'analyze trends and anomalies'
    prompt: '<compare metrics QoQ, identify changes, correlate across sources>'
    assigned_to: general
    depends_on: [data-collection]
    verified_by: verifier
    verify_prompt: '<verify calculations, check trend claims match the underlying data>'
    timeout_ms: 1800000
  - id: deliverable
    title: 'produce final review deck and summary'
    prompt: '<create executive summary doc and supporting deck>'
    assigned_to: general
    depends_on: [data-collection, analysis]
    verified_by: verifier
    verify_prompt: '<verify all charts match source data, recommendations supported by analysis>'
    timeout_ms: 1800000
```

Example fragment — a `verify-as-task` (E2E suite) and a user-skipped task. Use these
forms only when Step 3.5's rules allow them:

```yaml
tasks:
  - id: e2e-suite
    title: 'run full e2e test matrix'
    role: verify-as-task           # task IS the verification — engine auto-skips wrapping verifier
    prompt: '<run pnpm test:e2e and produce a pass/fail report>'
    assigned_to: tester
    depends_on: [feature-impl]
    timeout_ms: 1800000

  - id: gossip-roundup
    title: 'collect this week's celebrity gossip'
    prompt: '<search RED / Weibo / X for top items and summarize>'
    assigned_to: general
    verified_by: ~                 # explicit null = user has confirmed skip
    verify_skip_reason: 'casual content; user-only consumer; no downstream dependency'
    # NOTE: legal only when this task is NOT `depends_on`-ed by any other task
    # (Step 3.5 rule 1 hard-ban) AND is not role=verify-as-task referenced
    # downstream (rule 3 hard-ban). Plan-exit + role=produce + skip requires
    # `verify_skip_reason` (rule 2). Engine rejects otherwise.
```

### Field cheatsheet (only the ones you actually need)

| Field | When |
|---|---|
| `depends_on` | Task truly needs another's output. Don't add ceremony. |
| `timeout_ms` | Large tasks: 25–30 min (10+ files / 300+ lines). Hard cap 30 min. Omit → defaults to the 30-min cap; YAML examples in the references omit it for brevity. |
| `max_retries` | Risky/flaky task. |
| `auto_reject_retries` (plan) | How many verifier FAILs the engine auto-retries (same session, verifier feedback injected) before escalating to you. Default 1. |
| `role` | `produce` (default — task creates a new deliverable) or `verify-as-task` (deliverable IS a verification report). See Step 3.5; you set role, you do NOT set verify on/off. |
| `verified_by` | Single agent, or array of distinct verifier agents (e.g. code-review + runtime-test). All must PASS. Optional. Omit only when user has confirmed `--skip-verify` for this task OR when `role: verify-as-task`. |
| `verify_prompt` | String for one verifier; map keyed by verifier agent name when responsibilities differ. Don't list the same verifier twice. For deep research reports, verify both factual correctness and depth/completeness. |
| `verify_skip_reason` | Required when `verified_by` is omitted on a `produce` task. **Must be a user-written explanation**, not your own. CLI populates this from the `--skip-verify` confirm prompt; copy through to YAML if the user typed it directly. |
| `verifier_config` (plan) | Plan-level verifier defaults: `default_verifiers` (used when a task omits `verified_by` but is still verify=on; defaults to `[verifier]`), `audit_sample_rate` (post-hoc sampling for verify=off tasks; default `0.0` — only enable when the user explicitly asks), `strict_mode` (reserved for multi-verifier cross-check; not yet implemented). |
| `output` / `gates` | Explicit file expectations or objective command checks. |

### Task rules

- One task = one verifiable deliverable. Split by **deliverable boundary**, not by keystroke.
- Every task needs `assigned_to`. `verified_by` is required UNLESS `role: verify-as-task`
  OR the user has explicitly confirmed `--skip-verify <taskId>` (in which case
  `verify_skip_reason` is required and `verified_by` is omitted / set to `~`). See Step 3.5.
- Workers must NOT wait for CI / code review / merge / sleep loops — those are owner work.
- Deep research plans must state an explicit deliverable contract in the synthesis/final-report
  prompt. Do not rely on vague phrases like "complete report" or "full analysis" for high-cost
  research.

### Anti-pattern: over-sharding

If the work fits in one worker's scope, don't artificially split it. Wastes session setup, makes the plan harder to track. Ritual splits ("first research, then implement" when you already know what to implement) are the same trap.

## Step 3.5 · Verify decisions (who turns verification on/off)

**Verify is on by default. You do NOT turn it off — that's the user's call.**

Your job at plan time: write a default plan that verifies everything, and mark
`role: verify-as-task` for tasks whose deliverable IS a verification report
(E2E pass/fail, code review verdict, security audit, data cross-check) so the
engine doesn't wrap a verifier around another verifier. Decide role by
**deliverable shape**, not task title — a task titled "verify the merge" that
re-runs the implementation is `produce`; a "smoke checks" task that emits a
PASS/FAIL after running real commands is `verify-as-task`.

| Task role | User action | Effective verify | Who set it |
|---|---|---|---|
| `produce` (default) | none | **on** | engine |
| `produce` | `--skip-verify <id>` or plan YAML explicit | **off** (needs `verify_skip_reason`) | user |
| `verify-as-task` | none | **off** | engine (sees role) |
| `verify-as-task` | explicit `verified_by` | **on** (rare, allowed) | user |

### Structural floor (engine rejects plans that violate it)

Floor is purely graph-driven on `depends_on` — no keyword/content judgment.
Three tiers (two HARD BAN, one REASON REQUIRED):

1. **HARD BAN — task is `depends_on`-ed by another task.** No skip even with
   a reason. Downstream would propagate errors silently.
2. **REASON REQUIRED — plan-exit `produce` task wants to skip.** No task
   depends on it, but it produces a user-facing deliverable. Allowed only
   when `verify_skip_reason` is set (user-written).
3. **HARD BAN — `role: verify-as-task` is itself `depends_on`-ed.** A
   verification report consumed downstream must stay verified.

If the user wants to skip a HARD-BAN task, they must change plan structure
(remove the dependants, or split the task) — engine rejects with
`Task <id> cannot skip verify: <reason>`.

`verify_skip_reason` must be the **user's words** (from CLI confirm prompt or
quoted from chat). Never invent a reason to justify skipping verify — that's
exactly the failure mode this design prevents.

The team's value isn't parallelism — it's **independent verification**. The verifier must independently re-derive, not re-read the producer's work.

Force re-derive — write `verify_prompt` to make the verifier re-run commands, go back to original sources, or apply adversarial reasoning — when ANY applies:

- Code changes behavior, data flow, permissions, or security boundaries
- Deliverable contains external facts, numbers, dates, quotes, or citations
- Calculations / formulas / financial or statistical models
- Legal / regulatory / policy interpretations
- Business recommendations, risk assessments, strategic conclusions
- Material will be sent externally (users / customers / partners / executives / regulators)
- Multiple sources synthesized — contradictions may exist
- Cross-tool execution had side effects (wrote to systems, sent messages, updated records)

Bad `verify_prompt`: `Check the deliverable.`
Good `verify_prompt`: `Re-run the validator unit test on the staged change. Independently confirm fail-fast behavior on malformed plan-schema.ts. Do not re-read producer's diff.`

## Step 4 · Write good prompts

Each `prompt` and `verify_prompt` is a self-contained spec — a fresh session must be able to act on it. Retry context and file paths are auto-injected.

Bad: `Based on your findings, implement the fix.`
Good: `Update src/validators/plan-schema.ts so tasks with verified_by also require a non-empty verify_prompt. Add validation + unit test. Report the commit hash.`

When a task maps to a known skill, name it: `use the <skill-name> skill to ...`. Pick the skill at plan time — you have more context than the worker. Verify the name exists in `<available_skills>`; a typo gives "skill not found".

Don't name a skill that waits on CI / review / human reply — that's owner work.

## Step 5 · Launch

Use the `launch-a-plan` recipe from the platform command reference selected by **Mandatory platform command router**. That recipe writes `plan.yaml` safely for the current shell and then runs `mavis team plan run <plan-yaml>`.

Blocks until plan leaves `pending` and prints status. Use `--no-wait` for fire-and-forget. Do not use bash-only `$WORKSPACE/...`, `mkdir -p`, or heredoc syntax in Windows PowerShell.

## Step 6 · Watch and intervene

Heartbeat is every 5 minutes. For faster inspection, use the `inspect-session-messages` recipe from the selected platform command reference.

| Signal | Action |
|---|---|
| Worker polling CI/CR | Send: `Stop polling. Write deliverable.md and exit.` |
| Worker progressing but near timeout | `mavis team plan extend-timeout <plan_id> <task_id> --minutes 15` (≤60 min/request, only `producing` status) |
| Worker stuck >5 min | Hint, extend, or pause |
| Direction is wrong NOW | `mavis team plan steer <plan_id> --message "<correction>"` |
| Dependency graph wrong (depends_on should be parallel) | `mavis team plan unblock <plan_id> <task_id>` (only `blocked` status; doesn't modify plan.yaml) |
| User changed their mind about verify (on a future / done task) | `mavis team plan update <plan_id> <task_id> --verify on` (or `off`). On a `done` task this triggers the reopen flow described in the design doc §6.3. |
| Plan beyond salvage | `mavis team plan cancel <plan_id>` and take over |

`pause` / `resume` exist for manual debugging — not the normal path.

## Step 7 · Submit a decision

Use the `submit-a-decision` recipe from the selected platform command reference. The JSON shape is:

```json
{
  "last_cycle": [
    { "task_id": "task-1", "verdict": "manual_retry", "reason": "Fix the schema edge case the verifier found." }
  ],
  "next_cycle": [
    {
      "task_id": "task-1",
      "title": "fix schema edge case",
      "prompt": "Update the validator so ...",
      "assigned_to": "<agent-name>",
      "verified_by": "verifier",
      "verify_prompt": "Re-run the validator unit test ...",
      "timeout_ms": 1800000
    }
  ],
  "plan_complete": false,
  "message_to_user": "Round 2: retrying with tighter scope."
}
```

Verdicts:
- `accept` — done.
- `reject` — retry because the task failed review.
- `override_accept` — accept anyway because the verifier is wrong.
- `manual_retry` — retry with your explicit correction in `reason`.

### Pick the verdict (and decide same-session vs new-session)

| Scenario | Verdict | Same session retry? |
|---|---|---|
| Minor fix (changelog, formatting, naming) | `reject` original task_id | ✓ Yes — keeps worktree, code context, history |
| Right direction, wrong implementation | `manual_retry` original task_id (correction in `reason`) | ✓ Yes — correction injected |
| Fundamentally wrong approach | `reject` + new task_id in `next_cycle` | ✗ New session, fresh start |
| Independent follow-up | New task_id in `next_cycle` only | ✗ New session, separate deliverable |

Same task_id retries reuse the existing session — worker keeps worktree + context. New task_id = cold start (3–5 min wasted on setup). Don't burn it on a "missing changelog" fix.

**Never mix retry + new task in one decision.** Engine runs the retry first, the new task waits, the retried worker may redo finished work. Either retry only, OR accept and put remaining work in a new task next round.

## Recovery rules

| Situation | Action |
|---|---|
| Worker killed by timeout | Check for `deliverable.md` / branch push / MR first. Timeout ≠ failure. If real, take over; else split or raise `timeout_ms` (≤30 min cap). |
| Worker polling CI/CR | Tell it to stop and exit after writing `deliverable.md`. |
| Agent not found | Re-check exact names from `<peers_update>` or the platform reference's `list-agents` recipe. |
| Direction wrong mid-cycle | `steer`, don't open detached side sessions. |

## Worker vs owner scope

| Responsibility | Owner |
|---|---|
| Code, test, push, create MR, write `deliverable.md` | **Worker** |
| Research, analyze, draft, write `deliverable.md` | **Worker** |
| Wait for CI / CR, merge MR, clean up worktree | **You (owner)** |
| Any sleep / polling waiting for external systems | **Forbidden in worker prompts** |

Workers have a 30-minute hard cap. Design prompts to produce and exit.

## Mid-plan scope changes

| Situation | Action |
|---|---|
| Current work is now wrong | `steer` immediately to abort + redirect. |
| Current work is fine, next steps need to change | Wait for CycleReport, adjust `next_cycle` in your decision. |
| Both | `steer` to fix running work, then update `next_cycle`. |

Only create a separate plan if the user explicitly says "this is out of scope".

## Quick reference

| Command | Purpose |
|---|---|
| `mavis team plan run <yaml>` | Launch a new plan |
| `mavis team plan run <yaml> --skip-verify <id>[,<id>...]` | Launch with user-confirmed verify=off for one or more tasks. Each id must pass the structural floor (see Step 3.5); CLI prompts for `verify_skip_reason` per task before launch. |
| `mavis team plan status <plan_id>` | Inspect current state |
| `mavis team plan steer <plan_id> --message <text>` | Redirect running work |
| `mavis team plan unblock <plan_id> <task_id>` | Force `blocked` task → `ready` |
| `mavis team plan extend-timeout <plan_id> <task_id> --minutes <n>` | Add runtime to active producer |
| `mavis team plan update <plan_id> <task_id> --verify on\|off [--reason <text>]` | Change a task's verify state mid-plan. `on` runs immediately for future / `producing` tasks; for `done` tasks triggers the reopen flow. `off` requires `--reason` and re-applies structural-floor checks. |
| `mavis team plan decision <plan_id> --file <path>` | Submit next-cycle decision |
| `mavis team plan cancel <plan_id>` | Stop the plan |
