---
name: skill-evolve-nightly
description: |
  Nightly batch skill maintenance. Reads pending signals and proposals, plans
  which skills to create/refine via team engine. Managed by daemon's internal
  scheduler — not visible to agents or users. Do not load this skill manually
  -- it is designed for automated nightly runs.
schedule: '0 2 * * *'
timezone: 'Asia/Shanghai'
session:
  mode: new
  keepSessions: null
---

# Skill Evolve Nightly

Batch scan and maintain skills during the nightly cron window.

> Lifecycle housekeeping (30d stale flagging + 90d archive) lives in
> `SkillLifecycleScheduler` (pure-code, weekly Sundays 03:00 Asia/Shanghai).
> This SKILL.md does NOT scan usage data or touch the archive — focus
> strictly on signal + proposal triage.

## Trigger

This skill is managed by the daemon's internal scheduler and runs automatically
at 02:00 Asia/Shanghai daily. The session must have `session.metadata.purpose = 'skill-evolve'`.

The InternalScheduler also applies a workload gate: when both pending signals
**and** pending proposals are 0, the nightly session is not spawned at all
(saves an OpenCode session + LLM tokens when there is nothing to triage).

## Capability hint

Before the SKILL.md body, the internal scheduler injects a
`<skill-evolve-capability>` block telling you whether built-in skill MR
evolution is available **right now**:

```
<skill-evolve-capability>
builtinMrEnabled: true
sourceRepo: /path/to/agent-archon
mrTargetBranch: dev
builtinSkillSourcePath: /path/to/agent-archon/packages/daemon/skills
builtinSkillRuntimePath: /path/to/runtime/skills
</skill-evolve-capability>
```

Read this block first. The values gate Phase 4's built-in handling:

- `builtinMrEnabled: false` (or block missing) → built-in signals get dismissed
  with `reason='built-in skill, requires MR (disabled by config)'` (legacy
  behavior).
- `builtinMrEnabled: true` AND `sourceRepo: <path>` → dispatch a built-in MR
  worker per signal (Phase 4.5).
- `builtinMrEnabled: true` AND `sourceRepo: null` → cannot proceed; dismiss
  with `reason='built-in MR enabled but no source repo found'` and log a
  warning to the summary so an operator notices the misconfiguration.

## Procedure

### Phase 1: Gather signals

```bash
mavis skill signal list --verdict pending
```

If an older CLI does not support `--verdict`, fall back to:

```bash
mavis skill signal list --limit 200
```

Then filter `verdict == "pending"` locally. Do not fail the nightly run solely
because the CLI is older than this SKILL.md.

Collect all pending signals. Each signal contains: `skillRef` (optional), `attribution`, `issueKind`,
`evidenceExcerpt`, and optional `rationale`.

### Phase 1b: Gather proposals (v3)

```bash
mavis skill proposal list --verdict pending
```

Collect all pending proposals. Each proposal contains: `suggestedName`, `suggestedScope`,
optional `targetAgentName`, `summary`, `rationale`, optional `sketch`, and `evidenceExcerpts[]`.

Proposals are agent-submitted suggestions for **new** skill creation. They differ from
`issueKind='missing-skill'` signals by carrying a structured proposal (suggested name/scope/
sketch) instead of a one-line "what's missing".

### Phase 3: Self-loop guard

Filter out signals AND proposals produced by sessions with `purpose = 'skill-evolve'`.
These are self-referential and must be skipped to prevent feedback loops.

### Phase 4: Triage each signal

For each pending signal, decide:

| Condition | Action |
|-----------|--------|
| Evidence is concrete and points to a skill defect | Plan a **refine** task |
| Evidence describes a missing capability with clear use case | Plan a **create** task |
| Evidence is vague, anecdotal, or single-occurrence | **Dismiss** (`verdict='dismissed'`, `reason='insufficient evidence'`) |
| Problem is agent behavior, not skill content | **Dismiss** (`reason='agent error, not skill issue'`) |
| Signal targets a built-in skill AND `builtinMrEnabled: true` AND `sourceRepo` is set | Plan a **builtin-mr** task (see Phase 4.5) |
| Signal targets a built-in skill AND built-in MR is unavailable | **Dismiss** with the appropriate `reason` (see "Capability hint" above) |

Detect "built-in skill" by any of these signals:

- `skillRef` prefix `global:` (canonical daemon-bundled namespace)
- `mavis skill list <agent>` shows the skill with `source_type: 1`
- the visible skill location is under `.builtin-skills/`
- the resolved file is under `builtinSkillRuntimePath` or the source repo's
  built-in skill source path

Agent-level built-ins (under `<agent>/.builtin-skills/`) also count as built-in
and need the same MR treatment. Do not treat a runtime-copy edit under
`.mavis/.builtin-skills` as resolved; if the source repo is unavailable, leave
the signal pending or dismiss with the precise built-in-MR-unavailable reason.

### Phase 4b: Triage each proposal (v3)

For each pending proposal, decide:

| Condition | Action |
|-----------|--------|
| `suggestedName` overlaps an existing skill (any scope) | **Dismiss** (`reason='overlaps existing skill <ref>'`) |
| Evidence is single-occurrence, anecdotal, or describes a one-off task | **Dismiss** (`reason='insufficient evidence — pattern not yet repeated'`) |
| `summary`/`rationale` is too vague to author a meaningful skill | **Dismiss** (`reason='proposal too vague'`) |
| Concrete pattern, no overlap, evidence backs reusability | Plan a **proposal-create** task (see Phase 4.x) |

Overlap check: list existing skills via `mavis skill list <agent>` and look for
similar names/descriptions. Be liberal — when in doubt about overlap, dismiss
and let the proposer re-submit with sharper differentiation.

### Phase 4.x: Proposal-create task plan (v3)

For each accepted proposal, plan a worker task that loads `skill-creator`:

```yaml
- id: proposal-create-<sanitized-name>
  description: "Create skill from proposal: <proposalId> — <suggestedName>"
  skills: [skill-creator]
  prompt: |
    You are creating a new skill from a proposal.

    Proposal ID: <proposalId>
    Suggested name: <suggestedName>
    Suggested scope: <suggestedScope>
    Target agent (when scope=agent): <targetAgentName>
    Summary: <summary>
    Rationale: <rationale>
    Sketch (if provided): <sketch>
    Evidence:
      - <evidenceExcerpts[0]>
      - <evidenceExcerpts[1]>
      - ...

    Steps:
    1. Load `skill-creator`.
    2. Decide the final name + scope (you may override the suggestion if a
       different choice is clearly better).
    3. Draft the SKILL.md following skill-creator's eval-driven loop.
    4. Write to the appropriate dir based on the resolved scope.
    5. Run: `mavis skill proposal mark-acted --proposal-id <proposalId> --skill-ref <resolvedSkillRef>`
    6. If you decide NOT to create after deeper review, run instead:
       `mavis skill proposal cancel --proposal-id <proposalId> --reason "<why>"`

    Hard rules:
      - Never spawn additional skill-evolve tasks.
      - If the resolved scope is `global` (built-in), STOP and report — global
        new skills require a separate MR-driven flow that this task does NOT
        cover. The proposal stays pending for the next night to be handled
        appropriately, OR a human picks it up via `mavis skill proposal info`.
```

After the worker reports back:

- `mark-acted` succeeded → proposal is closed with `createdSkillRef` recorded
- worker dismissed → proposal is closed with reason
- worker failed → leave proposal `pending` for retry next night

### Phase 4.5: Built-in MR task plan

When `builtinMrEnabled: true` AND `sourceRepo` is set, **one MR per built-in
skill signal**. Group multiple signals for the same `skillRef` into a single
worker (one MR covers all signals for that skill).

For each unique built-in `skillRef`, plan a worker task:

```yaml
- id: builtin-mr-<sanitized-skill-name>
  description: "Built-in skill MR: <skillRef> — <one-line problem>"
  skills: [worktree-management, mr-workflow]
  prompt: |
    You are opening a GitLab MR to evolve a built-in skill. Follow this
    procedure exactly — do NOT auto-merge.

    Skill: <skillRef>
    Source repo: <sourceRepo>
    Target branch: dev
    Source file: <builtinSkillSourcePath>/<skill-name>/SKILL.md
    Runtime copy: <builtinSkillRuntimePath>/<skill-name>/SKILL.md

    Signals (all targeting this skill):
      - <signalId-1>: <issueKind> — <evidenceExcerpt>
      - <signalId-2>: <issueKind> — <evidenceExcerpt>
      ...

    Steps:
    1. In <sourceRepo>, run `bash scripts/create-worktree.sh evolve/skill-<skill-name>-<YYYYMMDD>`.
       Branch name pattern: `evolve/skill-<skill-name>-<YYYYMMDD>` so MRs are
       easy to identify and don't collide across nights.
    2. In the new worktree, edit the SKILL.md per the signal evidence. Apply
       the smallest change that resolves the reported problem.
    3. Sync the runtime copy: copy the modified file from
       `<builtinSkillSourcePath>/<skill-name>/SKILL.md` to the same relative
       path under `<builtinSkillRuntimePath>` so the running daemon sees the
       new version immediately (per the project rule "Built-in skill 改动必须同步 repo").
    4. Update `changelogs/YYYY-MM-DD.md` under `## evolve/skill-<skill-name>-<YYYYMMDD>`:
       `- **evolve(skill)**: <skill-name>: <one-line problem summary>`
    5. Commit with the trailer `Manual-Test: N/A (skill content only)`.
       Do NOT include `Co-Authored-By` lines.
    6. Push and open the MR:
       ```
       glab mr create -R gitlab.xaminim.com/matrix/agent-archon \
         --title "evolve(skill): <skill-name>: <one-line problem>" \
         --target-branch dev \
         --description "$(cat <<EOF
       ## Built-in skill evolution

       Triggered by skill-evolve-nightly. **Do not auto-merge — awaiting human review.**

       ### Signals
       - <signalId-1> (<issueKind>): <evidenceExcerpt>
       - <signalId-2> (<issueKind>): <evidenceExcerpt>

       ### Change
       <one-paragraph explanation>

       ### Notes
       - Source updated: \`packages/daemon/skills/<skill-name>/SKILL.md\`
       - Runtime copy synced for the spawning daemon's session
       - This MR was opened automatically; please review the wording and intent
       EOF
       )" \
         --squash-before-merge --remove-source-branch
       ```
    7. Send a Feishu notification to "Mavis Agent新框架讨论" group
       (chat_id `oc_106bfcb0c531be7ffa627b8f339b60d0`) with the MR URL,
       skill name, and a one-line summary. **Do not auto-merge** — the MR
       must be merged manually after human review.
    8. Report back the MR URL so the parent session can record it on the
       associated signals.

    Hard rules:
      - One MR per skill (never bundle multiple skills in one MR).
      - Never run `git add .` or `git add -A` — add only the files you edited.
      - Never use `--no-verify` to bypass hooks.
      - If any step fails, stop and report the failure with the full error
        message; do NOT delete the worktree on failure.
```

After the worker reports back:

- MR successfully opened → set the signal verdict to `acted` and append the
  MR URL to the signal's `rationale` (so future runs see it was handled).
  **Do not** mark `resolved` — only the user merging the MR resolves it.
- Worker failed → leave signal `pending` for retry next night, append the
  failure reason to the summary.

### Phase 6: Determine scope for new skills

For each planned **create** task, apply the three-question test:

- **Will the answer change for a different user?** -> User skill (`~/.mavis/skills/`)
- **Does it hold true across projects?** -> Agent skill (`~/.mavis/agents/<name>/skills/`)
- **Only relevant to the current project?** -> Project skill (`.harness/skills/`)

### Phase 7: Execute via team

If there are tasks to execute, dispatch them as a team plan:

```yaml
# Generated plan structure
tasks:
  - id: refine-<skill-name>
    description: "Refine <skill-name>: <problem summary>"
    skills: [skill-refiner]
    prompt: |
      Load skill-refiner. Fix this skill:
      Skill: <skillRef>
      Problem: <evidenceExcerpt>
      Attribution: <attribution>
      Rationale: <rationale>

  - id: create-<skill-name>
    description: "Create new skill: <skill-name>"
    skills: [skill-creator]
    prompt: |
      Load skill-creator. Create a new skill:
      Goal: <derived from signal evidence>
      Scope: <user|agent|project>
      Context: <evidence and suggested approach>

  # Built-in MR tasks from Phase 4.5 are appended here, one per built-in skillRef.
```

Workers run in parallel. Each worker uses `skill-creator`, `skill-refiner`,
or the built-in MR procedure respectively.

If no team engine is available, execute tasks sequentially using subagents.

### Phase 8: Collect results and report

After all tasks complete:

1. Update signal verdicts:
   - Successfully refined / created → `verdict='resolved'`
   - Built-in MR opened → `verdict='acted'` + MR URL in rationale (NOT
     `resolved` — that happens when the user merges the MR)
   - Failed to fix → `verdict='pending'` (will retry next night)

2. Generate a summary:
   ```
   ## Skill Evolve Nightly Summary
   Date: <local datetime>
   Signals processed: <N>
   - Created: <list>
   - Refined: <list>
   - Built-in MRs opened: <list with MR URLs>
   - Dismissed: <list with reasons>
   - Failed (will retry): <list>
   ```

3. Send summary to root session.

4. If IM is connected, send a condensed notification:
   ```bash
   mavis communication send --to <root-session> --command prompt \
     --content "<summary>"
   ```

## Hard constraints

- **Self-loop prevention**: skip all signals from `purpose=skill-evolve` sessions
- **Pinned skills are untouchable**: never modify without explicit signal
- **Built-in skills go through MR review**: when `builtinMrEnabled` is true and
  a source repo is found, open one MR per built-in skill signal and **never
  auto-merge** — wait for human review. When unavailable, dismiss with a
  precise reason so an operator can intervene.
- **One night, one pass**: do not re-run if the cron triggers multiple times in one window
- **No lifecycle scanning here**: stale flagging + archive moves live in
  `SkillLifecycleScheduler` (pure-code weekly). This skill must not call
  `skill-evolve/usage` or move anything to `.archive/`.

## Failure handling

- If signal list API fails, log the error and skip this nightly run
- If a worker task fails, mark the signal as pending for retry and continue with others
- If team engine is unavailable, fall back to sequential subagent execution
- Built-in MR worker failures: leave signal `pending`, never partial-commit
  (worker must clean up its worktree on failure or report it for manual cleanup)
