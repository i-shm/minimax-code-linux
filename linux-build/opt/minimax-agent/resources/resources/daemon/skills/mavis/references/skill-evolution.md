# Skill Evolution

Use this doc when editing built-in Mavis skills from execution or review signals. The goal is to
improve the skill without confusing agent failures for skill failures.

## Three-Way Attribution

### Skill Issue -> edit the skill

The skill text is wrong, outdated, misleading, or missing a critical step. Evidence: the agent
followed the skill correctly and still got a bad outcome because the instructions were bad.

### Agent Issue -> skip, do not edit

The skill is correct but the agent failed to follow it. Do not strengthen a correct skill merely
because one run ignored it. That creates bloat.

### Environment Issue -> edit the skill

External tooling, APIs, or project structure changed and the skill now references stale paths,
commands, or behavior.

## Conservative Editing Constraints

1. Patch-first: prefer 1-3 line edits over rewrites.
2. Do not delete core API references unless they are genuinely deprecated.
3. Do not add generic best practices; keep instructions domain-specific.
4. Preserve the skill's voice and structure.
5. One concern per edit; avoid bundling unrelated fixes.

## Diff Checklist

- every changed line traces to a concrete signal or evidence excerpt
- no working instruction was removed without cause
- frontmatter `name` and `description` remain valid
- description still matches actual scope
- new text is specific and actionable
- file size stays under 100KB
- no secrets, tokens, or private paths are introduced

## Git Push Failure Decision Tree

- branch protection -> create branch + cherry-pick + push + MR if CLI available; otherwise report manual push needed
- auth failure -> report manual push needed
- network failure -> retry once, then report
- other failure -> report raw error

## Evolve Report Template

```markdown
## Skill Evolution Report

- **Run ID**: <run-id>
- **Skill**: <skillRef>
- **Action**: refine | rewrite | optimize_description | skip
- **Signals processed**: <count>
- **Rationale**: <1-2 sentences>
- **Changes**: <what changed or why skipped>
- **Git status**: committed + pushed | committed (push failed) | no git
```
