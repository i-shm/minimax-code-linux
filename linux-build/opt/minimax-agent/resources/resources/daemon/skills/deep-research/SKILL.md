---
name: deep-research
listed: false
retired: true
description: >
  Coordinate a Mavis multi-agent team plan. Use only when the user explicitly
  unambiguously asks to use an agent team
descriptions:
  zh-Hans: "协调 Mavis 多 Agent 团队计划。仅当用户明确且毫不含糊地要求使用 agent team 时使用。"
displayNames:
  zh-Hans: "深度研究"
---

# Deep Research

Run the complete five-step Deep Research pipeline through Mavis Team Engine.
Do not answer the research question directly in the owner session.

This skill is based on `dr-harness`'s `deep-research-file-input-multi` prompts,
with Team Engine as the orchestration layer.

## Pipeline

The pipeline always runs these five steps in order:

1. Background Search -> `background.md`
2. Direction Judgment -> `judgment.md`
3. Deep Analysis -> `analysis.md` and `research_plan.md`
4. Deep Research -> `document.md`
5. Final Writing -> `final.md`

All steps are producer tasks assigned to `general`. Do not attach per-step
verifiers. The Team plan must set `verify_skip_reason` on every task.

## Important constraints

- Follow-up user questions are supported through `conversations.md`. Every user
  turn must still run all five steps.
- Do not add Step 0 clarification, best-of-N, trajectory export, SFT export, or
  verify/rewrite gates.
- Do not set task `timeout_ms`; use Team Engine defaults.
- Do not use `depends_on` between steps. Team Engine's structural floor rejects
  verify-skipped tasks that downstream tasks depend on. The renderer emits all
  tasks with `depends_on: []` and `max_concurrency: 1`; the engine schedules the
  five ready tasks in declaration order.
- Prefer lightweight web tools. Use `web_search` for search and `web_fetch` /
  `WebFetch` for page retrieval when available. Avoid browser automation unless
  the user explicitly asks for logged-in or interactive browser behavior.
- The final response must be exactly the contents of `final.md`, with no owner
  summary or execution notes.

## Exact input preservation

The owner session must pass user input into the pipeline without interpretation.

- Write the current user research request to `raw_query.txt` exactly as the user
  supplied it. Do not paraphrase, summarize, translate, explain, add inferred
  intent, add style requirements, add output-format guesses, or prepend framing
  such as "The user asks..." / "用户的问题是...".
- If the user invoked this skill with a slash command, remove only the slash
  command token and surrounding whitespace before writing `raw_query.txt`.
- `conversations.md` must contain only literal user/assistant conversation
  records and artifact paths. Do not add owner-agent thoughts, research plans,
  style proposals, assumptions, inferred preferences, or hidden reasoning.
- If exact text from an earlier turn is unavailable, record a readable path to
  the source instead of reconstructing or summarizing it.

## Owner-leak anti-patterns

These are the most common ways owner-agent intent leaks into the pipeline.
The child steps run their own background, judgment, analysis, research, and
writing — they do not need the owner's pre-analysis. Do not:

- **Rephrase the user's question into `raw_query.txt`.** Example wrong: user
  wrote `特斯拉 2026 上半年财报关键看点`; owner writes
  `用户想知道特斯拉 2026 上半年的财务亮点和潜在风险` to `raw_query.txt`. Write
  the exact original instead.
- **Inject owner framing into `conversations.md`.** Example wrong: writing
  an `### User` block like `The user is asking about A from the angle of B`.
  Keep the `### User` block to the literal user message only.
- **Fabricate a clarification exchange.** Example wrong: adding an
  `### Assistant` clarification question and an `### User` answer that the
  user never typed. Omit the optional clarification block when no real
  clarification happened.
- **List an owner-authored note as a supporting artifact.** Example wrong:
  writing `research_plan.md: <inline note about which keywords step 4
  should search>`. Only list real artifact paths produced by prior turn
  steps.
- **Copy the previous turn's assistant analysis paragraph into the current
  turn's `### User`.** Keep the `### User` block literal; the assistant
  analysis belongs in the prior turn's `### Assistant Final Output` block
  (as the `final.md` path), not in the current user message.

## Clarification default

Do not clarify by default. The owner session must not pre-analyze the user's
question, infer background, guess the likely direction, or ask exploratory
questions before the five-step pipeline. The child steps own background search,
judgment, analysis, research, and writing.

Ask a clarification question only when the user input is so underspecified that
it cannot form any research task at all, such as a bare greeting. If a real
clarification happens, record only the exact assistant question and exact user
answer in `conversations.md`; otherwise omit the optional `### Assistant` /
follow-up `### User` clarification sections.

## Conversation structure

`conversations.md` is required for every run. It should follow the DRHarness
multi-turn shape:

```markdown
# Conversations

## Turn 1
### User
<exact user query for that turn>

### Assistant
<optional: only a real assistant clarification question, if one happened>

### User
<optional: only a real user clarification answer, if one happened>

### Assistant Final Output
Primary artifact:
- final.md: <previous final.md path>
- Topic: <optional, mechanically copied from the first line of final.md>

Supporting artifacts:
- background.md: <previous background.md path>
- judgment.md: <previous judgment.md path>
- analysis.md: <previous analysis.md path>
- research_plan.md: <previous research_plan.md path>
- document.md: <previous document.md path>

## Turn 2
### User
<exact current user query>

## Use policy
- `raw_query` is the current task.
- `conversations.md` is historical context and optional reference material.
- `final.md` is the primary historical artifact. Every step should read the
  immediately previous completed turn's `final.md` when it is listed and
  readable.
- Prefer the immediately previous completed turn. If there are many turns, such
  as 20 turns, start from turn 19 when working on turn 20. Use older turns only
  when the current query explicitly depends on them, the previous turn is
  insufficient, or the user asks for cross-turn correction or synthesis.
- Under each prior `### Assistant Final Output`, the owner should list
  `final.md` and every still-readable prior supporting artifact path
  (`background.md`, `judgment.md`, `analysis.md`, `research_plan.md`,
  `document.md`). Do not omit a path because it "feels unrelated" — the next
  step decides which ones to read. Only omit a path when the file no longer
  exists on disk or when that turn never produced it.
- For other artifacts, read only the files relevant to the current step. For
  example, the background-search step should usually read the previous
  `final.md` and previous `background.md`, then reuse still-valid background and
  add only what the current query needs.
- Use other artifacts only to verify, reuse, repair, or extend prior work.
- If previous assumptions are wrong or stale, redo the relevant reasoning and
  write new current-turn files.
```

For the first turn with no previous assistant output, the `conversations.md`
content is simpler: only the current user query and the `Use policy` block —
no prior `### Assistant Final Output` block, no prior artifact paths. A
first-turn `conversations.md` should look exactly like this:

```markdown
# Conversations

## Turn 1
### User
<exact user query>

## Use policy
- `raw_query` is the current task.
- `conversations.md` is historical context and optional reference material.
- `final.md` is the primary historical artifact. Every step should read the
  immediately previous completed turn's `final.md` when it is listed and
  readable.
- Prefer the immediately previous completed turn.
- Use other artifacts only to verify, reuse, repair, or extend prior work.
- If previous assumptions are wrong or stale, redo the relevant reasoning
  and write new current-turn files.
```

Do not fabricate prior turns, prior assistant messages, or prior artifact
paths just to fill the multi-turn template shape.

## Runtime files

Create one workspace directory for the run. Prefer a scratch or tmp location,
not the user's project tree:

```text
<TMPDIR>/mavis-deep-research/<YYYYMMDD-HHMMSS>-<slug>/
```

Where `<TMPDIR>` resolves to:
- macOS/Linux: `/tmp` (or `$TMPDIR` if set)
- Windows (Git Bash): `/tmp` (auto-mapped by MSYS2)
- Windows (PowerShell): `$env:TEMP`

For a follow-up turn, reuse the same research thread directory when it is known
and create a fresh turn subdirectory such as:

```text
<run-root>/turn_001/
<run-root>/turn_002/
```

For the current turn, `<workspace>` means the current turn directory. Before
rendering the plan, write the exact user research question to:

```text
<workspace>/raw_query.txt
```

Also copy or create the required literal cross-turn conversation record at:

```text
<workspace>/conversations.md
```

The canonical files are:

| File | Created by |
| --- | --- |
| `raw_query.txt` | owner before plan render |
| `conversations.md` | owner before plan render |
| `background.md` | Step 1 producer |
| `judgment.md` | Step 2 producer |
| `analysis.md` | Step 3 producer |
| `research_plan.md` | Step 3 producer mechanical post-hook |
| `document.md` | Step 4 producer |
| `final.md` | Step 5 producer |

## Render and run

1. Pick a short slug from the research question.
2. Create the workspace directory and write `raw_query.txt` exactly.
3. Create or copy `conversations.md` using the required conversation structure
   above. Keep only literal conversation records and artifact paths.
4. Render the Team plan:

```bash
# Use python3 on macOS/Linux; use py -3 or python on Windows if that is your launcher.
<python> <skill-dir>/scripts/render_plan.py \
  --skill-dir <skill-dir> \
  --workspace-dir <workspace> \
  --current-date "<current date>" \
  --plan-name "deep-research-<slug>" \
  --assigned-to general \
  --output <workspace>/deep-research.team.yaml
```

The renderer injects the conversation context block into every step prompt.
`<workspace>/conversations.md` is required and must be non-empty.

5. Start the plan:

```bash
mavis team plan run <workspace>/deep-research.team.yaml --no-wait
```

6. Monitor completion with:

```bash
mavis team plan status <plan-id> --human
```

When the plan reaches a completed state, read `<workspace>/final.md` and return
that file's contents exactly.

## If a step fails

The generated plan uses `max_retries: 1` for each task. If the Team Engine still
cannot complete the plan, report the failure plainly and include the failed plan
ID and the current task status. Do not manually write missing step outputs.

## Bundled files

This skill is self-contained:

```text
SKILL.md
steps/1_background.md
steps/2_judgment.md
steps/3_analysis.md
steps/4_research.md
steps/5_writing.md
scripts/render_plan.py
```

Do not depend on the external `dr-harness` checkout at runtime.
