# Software Engineering Team Guidance

This reference is loaded when a Team task involves code changes. It provides code-specific
verification strategy and compact plan patterns.

> ⚠️ YAML strings shown here are English templates and must be translated into the user's language
> before submitting (mavis-team SKILL.md "Hard rule"). `timeout_ms` is omitted in examples
> (defaults to 30-min cap).

## Code preflight

Expands SKILL.md's readiness questions for code. Skip if context is already sufficient.

- **Read key files** — understand structure at a high level, not every line
- **Identify change boundary** — files, interfaces, downstream callers at risk
- **Verify scope** — if it fits in one file under 200 lines, do it yourself
- **Note constraints** — exact paths, naming conventions, invariants for worker prompts

Preflight output:

- **Default (silent)**: bake constraints directly into the implementation task's `prompt` field — no separate doc.
- **Shared design doc**: when 2+ implementation tasks depend on the same API contract / data schema / migration strategy, write `docs/<task>/design.md` and have impl tasks reference it via `depends_on`.

Stop here. Touching code is Team work, not preflight.

## Task splitting for code

Do **not** split codebase exploration from implementation — workers can read code and discover
context themselves. Only split when the deliverables are genuinely independent (e.g. data layer
vs API vs UI in different packages).

For code-producing plans, tests are a real deliverable boundary. By default, write the plan as:

1. **Implementation task** — product/source change plus obvious colocated tests the implementer can
   add while coding.
2. **Test coverage task** — a producer task, assigned to `tester` when available, that depends on
   the implementation and adds/updates required unit, integration, E2E, and manual-test evidence.
3. **Verifier task(s)** — read-only adversarial verification attached to the implementation and/or
   test deliverables.

If a verifier finds a test gap, route it back to the producer or the dedicated test coverage task.
Do NOT ask the verifier to edit project files. The verifier may use `$TMPDIR` scripts to reproduce
or attack behavior, then FAIL with the exact missing coverage.

## Code-specific verification

Beyond the general verification policy in the main skill, code verifiers must:

- **Run the code** — build, test, lint. Never review by reading the diff alone.
- **Check behavior** — verify the change does what it claims, not just that it compiles.
- **Test edge cases** — empty inputs, concurrent access, error paths, boundary values.
- **Review design** — naming, abstraction boundaries, consistency with existing patterns.
- **Security check** — no exposed secrets, no new injection vectors, proper auth enforcement.
- **Check migrations** — reversibility, data preservation, backward compatibility.

The verifier should NOT:

- Rubber-stamp by re-reading the producer's description
- Only check formatting or style
- Skip running tests because "the code looks right"
- Add or modify project test files; missing tests are producer work, not verifier work

Verifier FAIL for missing coverage should name the precise gap: unit, integration, E2E, and/or
manual-test evidence. The next cycle must add that coverage before another PASS can be accepted.

## Plan patterns for code

Use these as routing patterns, not copy-paste YAML. The model can write the final plan from the
task facts; keep the examples below only where they encode Mavis-Team-specific semantics.

### Pattern: implementation + dedicated test coverage + read-only verification

Default for code tasks: keep the verifier read-only, and make test creation a producer deliverable:

```
[implementation] --> [test-coverage]   (both verified; verifier does not edit files)
```

A typical task id pair is `feature-implementation` → `feature-test-coverage` so the
`depends_on` chain is self-documenting. Implementation prompt must include source change, obvious
colocated tests, changed files, and behavior. Test-coverage prompt must add/update required unit,
integration, E2E, and manual evidence without changing product behavior except to make it testable.
Verification prompts must re-run representative checks and FAIL with the exact missing evidence
when coverage is incomplete.

Use exact available agent names. If no `tester` exists, assign the test coverage task to the
implementation agent but keep it as a separate task so the verifier can judge test work explicitly.

### Pattern: implementation with review + test verification

For large or risky software subtasks, attach separate review and test verifiers to the same
implementation deliverable. Reserve it for migrations, prompt/agent/skill behavior, API/CLI
behavior, persisted data/config, permissions/routing/memory/cron, or cases where baseline failures
need independent attribution.

The schema is `verified_by` as an array + `verify_prompt` keyed by verifier name:

```yaml
tasks:
  - id: <impl-task>
    assigned_to: coder
    verified_by: [code-reviewer, tester]      # all must PASS
    verify_prompt:
      code-reviewer: '<adversarial diff review: correctness, architecture, contracts, security>'
      tester: '<runtime checks: fresh install, migration, marker idempotency, baseline attribution>'
```

Rules: map keys in `verify_prompt` must match `verified_by` (mismatched key falls back to the
task's `prompt`). Replace `code-reviewer` / `tester` with exact agent names from your roster.
If only built-in `verifier` is available, collapse to one split-view prompt — it may spawn
in-process subagents but must not launch a nested Team plan. Do not split testing into a downstream
task when it verifies the same implementation deliverable.

### Pattern: parallel component tracks + integration gate

When the feature spans independent components (data layer, API, UI), assign each to a separate
worker and add a final integration/e2e task that depends on all of them.

```
[data-layer] --\
[api-layer]  ---+-> [final-integration-check]
[ui-layer]   --/
```

The schema-relevant piece is the gate task — independent tracks have no `depends_on`, the gate
lists all of them:

```yaml
tasks:
  # ...three parallel tracks (one per layer), each with its own verified_by + verify_prompt...

  - id: final-integration-check
    title: 'final integration check'
    prompt: '<run the full integration suite that exercises all tracks end-to-end>'
    assigned_to: verifier
    depends_on: [data-layer, api-layer, ui-layer]   # gate fires after all tracks PASS
    verified_by: verifier
    verify_prompt: '<run integration suite, confirm real services (no mocked HTTP), verify cross-track outputs match the contract>'
```

Each parallel track follows Pattern 1 (impl + colocated tests + read-only verifier). The gate's
`verify_prompt` should re-derive end-to-end behavior, not re-read producer summaries.

### Anti-pattern — over-sharding a single-coder task

The pattern above is correct because each track lives in a different package. But if the work
fits one coder's scope, **do not split it into artificial sub-tasks**.

Wrong: split a data layer into `schema` → `repo` → `tests`, three tasks chained with `depends_on`,
each assigned to `coder`. Three cold-start sessions + 3× verifier overhead for work that has no
real parallelism.

Right: one task `invoice-data-layer`, prompt asks for schema + repository + unit tests + commit
hash, verified by re-running migration + CRUD + optimistic-lock conflict in a single pass.

Same trap shows up as "first research, then implement" splits when you already know what to
implement. If you can hold the full diff in your head, it's one task.

### Pattern: migration + compatibility verifier

For migrations (schema, API, dependency), have one worker do the migration and another
independently verify backward compatibility, data integrity, or rollback safety.

```
[migration-impl] --> [compatibility-check]
```

### Pattern: security-sensitive change + adversarial review

When the change touches auth, permissions, payments, or data access, have the verifier
specifically attempt to break the security boundary.

```
[impl] --> [adversarial-security-review]
```

### Pattern: broad mechanical sweep

For cross-codebase renames, env prefix changes, or API migrations across many files, split
by package/module boundary so workers can proceed in parallel without merge conflicts.

```
[package-A-sweep] --\
[package-B-sweep] ---+-> [verify-no-missed-spots]
[package-C-sweep] --/
```

## Report and documentation deliverables

When a code task includes producing a report (architecture review, audit findings, migration
assessment), reference `references/report.md` in the task prompt for writing principles,
quality signals, and format guidance.
