---
name: skill-evolution
description: |
  How to shape Mavis's skill set as you work — when and how to file a skill
  signal (existing skill is wrong / missing) versus a skill creation proposal
  (this session reveals a reusable new skill). Use when about to call
  `mavis skill signal report` or `mavis skill proposal report`, when the
  session-end fallback re-prompt asks you to reflect on signals/proposals,
  or when you need to read the full schema, attribution rubric, scope
  decision tree, or good/bad examples for either channel. Do not use for
  authoring an actual SKILL.md (that's `skill-creator` / `skill-refiner`).
---

# Skill Evolution Channels

Two ways to shape Mavis's skill set as you work:

| Channel | When | What you submit |
|---------|------|-----------------|
| **Signal** | An existing skill is wrong / missing | Issue kind + evidence |
| **Proposal** | This session reveals a reusable NEW skill pattern | Suggested name/scope/summary/rationale |

The nightly `skill-evolve-nightly` cron consumes both. Signals get triaged
into refine/create/dismiss. Proposals get triaged into create/dismiss
(and may be acted on by spawning `skill-creator`).

You don't author SKILL.md here — `skill-creator` / `skill-refiner` do that.

---

## When to use which channel

### Signal — file when ANY of these are true

- A loaded skill gave you wrong / outdated / contradictory / incomplete instructions
- A loaded skill's trigger conditions are too broad (firing when it shouldn't) or too narrow (not firing when it should)
- You wanted to do something but no skill covers the scenario (`issueKind=missing-skill`)
- A real skill defect that doesn't fit the categories above (`issueKind=other`)

### Proposal — file when ALL are true

- A clearly reusable working **pattern** emerged in this session
- No existing skill covers it
- The pattern repeats / will repeat (not a one-off task)
- You can summarize what the proposed skill would do in 1-2 sentences

If only some of the proposal conditions hold (especially "will repeat"),
**don't propose**. Submitting weak proposals wastes nightly review and
pollutes the skill catalog.

### When to use neither

- You failed to follow correct skill instructions → that's an agent error, NOT a skill issue
- The task was simply complex but no instruction was wrong → don't signal/propose
- You felt uncertain but the skill ultimately worked → don't signal/propose

---

## How to read the references

| Topic | Reference |
|-------|-----------|
| Full signal field rubric, issueKind/attribution decision table, examples of valid/invalid signals | [references/signal-rubric.md](references/signal-rubric.md) |
| Full proposal schema, scope decision tree, good/bad proposal examples | [references/proposal-rubric.md](references/proposal-rubric.md) |
| Exact CLI command templates with all flags | [references/cli-commands.md](references/cli-commands.md) |
| What happens to your submission after you file it | [references/nightly-pipeline.md](references/nightly-pipeline.md) |

Load the reference matching what you're about to do — don't read all of them at once.

---

## Hard rules

1. **Don't include suggested fixes in signals.** Evidence + rationale only.
   The fix is decided later by the skill-refiner workflow.
2. **Don't include full SKILL.md drafts in proposals.** A `sketch` (high-level outline)
   is OK and encouraged. Full drafting is `skill-creator`'s job.
3. **One-off ≠ proposal.** "I did a complex task once" is not enough.
   "This pattern will repeat" must be defensible.
4. **Quote actual conversation in `evidence` / `evidenceExcerpts`.** Not summaries.
   ≤ 200 chars per signal evidence; ≤ 300 chars per proposal evidence (max 3 entries).
5. **`attribution=agent_error` is NEVER a valid signal channel.** If the issue
   was your own mistake, don't file. Just adjust your behavior.
