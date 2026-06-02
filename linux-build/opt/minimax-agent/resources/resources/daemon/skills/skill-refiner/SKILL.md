---
name: skill-refiner
description: |
  Refine an existing Mavis skill with evidence-driven minimal patches.
  Use when a skill has a concrete problem (wrong instructions, outdated steps,
  missing edge case) backed by evidence. Do not use for creating new skills
  (use skill-creator), or for stylistic preferences without evidence.
---

# Skill Refiner

Apply the smallest evidence-backed patch to fix a real skill problem.

## When NOT to use

- Creating a brand-new skill -> use `skill-creator`
- No concrete evidence of a problem -> do nothing
- The agent failed to follow correct instructions -> agent error, not a skill issue

## Procedure

1. **Collect evidence**.

Identify exactly what went wrong. Evidence sources:

- A signal from `mavis skill signal list` with severity and issue-kind
- User feedback in the current session ("this skill told me to X but the right step is Y")
- A concrete failure trace where the skill's instructions caused wrong behavior

If the only evidence is "the skill could be better" with no specifics, stop here.

2. **Read the current skill**.

```bash
mavis skill show <name>
```

Capture the content and the `hash` field (needed for CAS protection in step 6).

3. **Attribute the problem**.

Before touching the skill, determine what actually went wrong:

| Situation | Action |
|-----------|--------|
| Skill text is factually wrong or outdated | Fix the skill |
| Agent didn't follow the skill's correct instructions | Do NOT change the skill -- agent error |
| Environment changed (new API, renamed command, etc.) | Update the skill to reflect new reality |
| Skill works for the common case but misses an edge case | Add the edge case |
| Stylistic preference with no functional impact | Do NOT change |

If the problem is not in the skill itself, dismiss the signal (if one exists) and explain why.

4. **Generate patch**.

Design the minimal change that fixes the problem. Document:

```
Problem:   <what is broken>
Evidence:  <specific quote, error trace, or user statement>
Rationale: <why this change fixes it without breaking other behavior>
```

Use `old_string` / `new_string` format for each edit point. Prefer surgical patches over
section rewrites.

5. **Self-check before applying**.

Ask yourself:

- Does this change actually address the evidence? (not a nearby symptom)
- Could it break existing correct behavior?
- Am I adding generic best practices instead of fixing a specific problem? (anti-pattern)
- Is this a self-referential modification? (skill-refiner editing itself -- forbidden)

If any check fails, revise the patch or abandon the change.

6. **Apply the patch**.

Two routes depending on skill type:

#### User / Agent skills (mutable)

```bash
# Via API (preferred -- includes CAS + audit)
curl -X POST http://127.0.0.1:$PORT/api/skill-evolve/apply \
  -H 'Content-Type: application/json' \
  -d '{
    "skillRef": "<scope:name>",
    "newContent": "<full updated SKILL.md content>",
    "action": "refine",
    "signalIds": ["<signal-ids-if-applicable>"],
    "expectedOldHash": "<hash-from-step-2>",
    "rationale": "<Problem + Evidence + Rationale>"
  }'
```

Or edit the file directly with the Edit tool, but always verify the hash hasn't changed first.

#### Built-in / Project skills (immutable at runtime)

These live in the repo (`packages/daemon/skills/` or `.harness/skills/`). Do NOT edit them
via the API. Instead:
1. Note the required change
2. Advise the user to make the change in a worktree and submit via MR
3. Dismiss the signal with reason "built-in skill, requires MR"

7. **Verify**.

After applying, re-read the skill and confirm:
- The patch landed correctly
- The frontmatter `name` and `description` are intact
- The overall skill still reads coherently

```bash
mavis skill show <name>
```

## Hard constraints

- **CAS required**: every apply must include `expectedOldHash`
- **No secrets**: never write API keys, tokens, or credentials into skill files
- **Size limit**: skill must stay under 100KB after patch
- **Frontmatter sacred**: `name` and `description` fields must survive every edit
- **No self-referential edits**: skill-refiner must not modify its own SKILL.md
- **Evidence mandatory**: every patch must trace back to a specific problem
- **Built-in skills are read-only**: changes go through MR, not runtime edits

## Anti-patterns

- Rewriting a skill from scratch when a one-line fix would work
- Adding generic disclaimers ("always check...", "be careful to...")
- Deleting a correct instruction because one signal reported a false positive
- Changing style (wording, formatting) without functional justification
- Applying multiple unrelated fixes in one patch (split them)
- Acting on a signal without verifying the evidence first

## Output contract

Deliver:
- The applied patch with problem/evidence/rationale documented
- Verification that the skill reads correctly post-patch
- Signal verdict updated (if triggered by a signal)

## Failure handling

- If the hash doesn't match (concurrent edit), re-read and re-plan the patch
- If the patch makes the skill worse on re-read, revert and try a different approach
- If evidence is ambiguous, dismiss the signal with explanation rather than guessing
