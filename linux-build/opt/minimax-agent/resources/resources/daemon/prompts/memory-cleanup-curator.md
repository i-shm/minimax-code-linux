You are doing your own memory daily cleanup.

Goal: rebalance MEMORY.md (hot, must-read) and memory/<topic>.md (on-demand topic files) to maintain healthy structure.

This is a **standalone maintenance task**. Do NOT communicate with any other session. When done, end your turn — there is no caller waiting for a report.

**Language**: Infer the user's language from user memory (user.md in your context); if unsure, default to English. Use that language for EVERYTHING — your own thinking/response text AND all memory entries you write (MEMORY.md, topic files, .summary.md). This prompt is in English for precision, but your working language and all output must match the user's language.

Available inputs (already in your context or via Read):
- memory/MEMORY.md — current hot layer
- memory/*.md (excluding archive/) — current topic files
- daily/ — historical daily digests (Read on demand if useful)
- memory/.summary.md — existing compressed index (if present, read it to understand current high-level structure)

## What belongs in durable memory

Only keep what you **cannot recover** from code, git, AGENTS.md/CLAUDE.md, skill prompts, or daily digest.

Four memory types help you decide:
- **user** — how the user thinks and works: preferences, workflow, communication style
- **feedback** — how you should behave next time: corrections, validated judgment calls, gotchas
- **project** — live context that code/git don't fully capture: deadlines, ownership, rationale
- **reference** — where to look outside the repo: docs, dashboards, chats, tickets

### Layer routing — three questions (narrowest first)

The four content types above describe **what** to keep. These three questions decide **where** it belongs:

1. Does the conclusion only apply to this project? → **project memory** — delete it if already covered in AGENTS.md/topic files; otherwise mark with `[→ project]` for orchestrator migration
2. Would the conclusion still hold on a completely different project? → **agent memory** (this file — keep it here)
3. Would the conclusion change for a different user? → **user memory** (you cannot write there; mark the entry with `[→ user]` so the orchestrator can migrate it). Note: the runtime `mavis memory append --user` path now requires a non-empty cross-project `--reason`; an entry that cannot meet that bar should NOT be marked `[→ user]` — it belongs in agent or project memory instead.

Apply in order — the FIRST matching layer wins. Your write scope is this agent's memory files only — for entries that belong elsewhere, annotate and keep; do not silently delete valuable entries you cannot migrate.

## What does NOT belong in durable memory (delete these)

- Repo structure, file paths, function names, signatures — re-read from code
- Git facts: recent diffs, blame, commit history, completed MR numbers
- Debugging recipes that belong in code, commit context, or docs
- Standing policy already captured in AGENTS.md / CLAUDE.md / skill prompts (your system prompt)
- Temporary task state, branch details, handoff scraps — scratchpad or handoff files only
- Raw activity logs, PR lists, work journals — keep the lesson, not the stream
- Routine status summaries already covered by daily digest
- Single-incident knowledge ("this one API uses PUT not POST") — discoverable, not worth a slot

## Classification rules

- **HOT** (keep in MEMORY.md): user hard rules, principles, current in-flight project state, frequently triggered engineering discipline — BUT only if not already in your system prompt or a loaded skill
- **BINDING_DEDUP** (delete from MEMORY.md): entries whose content is captured in AGENTS.md / CLAUDE.md / a skill prompt that's auto-injected or routinely loaded. The system prompt and skills are the source of truth — duplicating them in memory just spends tokens twice. Examples: "MR 提交后立即加载 gitlab-mr-review" → already in that skill's front matter; "manual smoke 强制" → already in manual-test skill.
- **TOPIC** (memory/<name>.md with frontmatter description): thick knowledge, detailed decisions, technical specs, reference material — anything the agent only needs when working in that domain
- **TOPIC_POINTER_DEDUP** (delete from MEMORY.md): entries that are just a simplified summary of a topic file AND contain no additional information beyond what the topic file + its description already provide. Topic descriptions are auto-injected — no need for redundant summaries in HOT.
- **DELETE**: superseded, expired, completed in-flight items, 30+ days inactive, or content recoverable from code/git/docs
- **UPDATE**: entries referencing stale artifacts — fix the content, don't just keep the old text

## Compression actions (use BEFORE deciding to delete)

These are first-class moves, not afterthoughts:

- **MERGE similar bullets** into one denser line. If 5 bullets all say "verify X before doing Y" with different X/Y, collapse them into one principle. If 3 bullets all repeat "测试不能跳过" in different wording, keep one. Same for design principles, debugging rules, communication patterns.
- **DOWNSHIFT verbose detail to topic file**, leave a one-line pointer in HOT. Example: instead of 4 bullets explaining a daemon mechanism, write "详细见 `mavis-platform.md`" and let the topic description carry the rest.
- **STRIP examples and rationales** from HOT bullets. HOT is for the rule itself; examples belong in topic files or skills.

## Topic file rules

- Max 10 topic files total. If your classification produces >10, merge adjacent domains, remove least-active, or recycle thin content into MEMORY.md
- Each topic file MUST have YAML frontmatter with a `description` field that helps future-you decide when to Read it (write it like a skill description)
- Topic name kebab-case, reflects domain (e.g. `daemon-platform.md`, not `daemon-orphan-cleanup-2026-04.md`)
- Each topic ≤ 30KB
- Use `mavis memory write-topic` CLI only for creating new topics; edit existing topics with Read/Write file tools

## MEMORY.md size targets — aggressive

- **Target ≤ 10KB.** This is the goal, not a stretch.
- **Hard ceiling 15KB.** Going over means you didn't compress hard enough — try another pass.
- If starting size > 15KB, plan for **at least 40% reduction** in this run.
- If starting size > 20KB, plan for **at least 50% reduction**. The structure has rotted; be ruthless.
- Do NOT manually maintain a "topic index" section — the system scans memory/*.md and injects descriptions automatically.

## Staleness verification

Before classifying, verify entries are still current. Use two tiers:

**Tier 1 — Always do (text analysis, no tools needed):**
- Cross-check daily digest: read recent daily entries for MRs merged or decisions that obsolete existing memory
- Completed in-flight items: entries referencing MRs, branches, or projects that sound finished based on daily digest or your knowledge
- BINDING dedup: compare MEMORY.md entries against your system prompt and loaded skill descriptions — if the rule is already there, delete from memory

**Tier 2 — Only if your workspace is the target project git repo:**
- CLI commands: verify referenced `mavis <subcommand>` still exists (`mavis <cmd> --help`)
- File paths: verify key paths on origin/dev (`git ls-tree -r origin/dev --name-only | grep <filename>`)
- Cron/skill prompts: spot-check `~/.mavis/agents/*/crons/*.md` for references to deleted commands

If Tier 2 is not available, skip silently — do not pad output with "Tier 2 skipped" notes.

## Execution order (apply in this order — compression beats deletion)

1. Read current MEMORY.md and all memory/*.md (non-archive)
2. Run staleness verification (Tier 1 always, Tier 2 if possible)
3. **Compress first**: merge similar bullets, downshift detail to topics, strip examples
4. **Then dedup**: drop entries already covered by AGENTS.md/CLAUDE.md/skills (BINDING_DEDUP) and topic files (TOPIC_POINTER_DEDUP)
5. **Finally classify the survivors**: HOT vs TOPIC vs DELETE vs UPDATE
6. Snapshot is automatic: the daemon already copied current files to memory/archive/<today>/ before spawning you. Do not copy archives yourself.
7. Use Write tool to write the new MEMORY.md and topic files.
   - Topic files MUST start with YAML frontmatter:
     ```
     ---
     description: <one-sentence description of when to Read this>
     ---
     ```
8. Verify final size with `ls -la memory/MEMORY.md`. If still over 10KB target, do another compression pass on the largest remaining sections.
9. **Write memory/.summary.md** — a compressed index of the final MEMORY.md.
   Format each entry as:
   ```
   ## <topic heading>

   - <one-line conclusion or principle>
     source: memory/MEMORY.md:<lineStart>-<lineEnd>
   ```
   Rules:
   - Write one entry per `###` section in MEMORY.md (or logical group if section is too large)
   - Each entry: one line conclusion + source line range from MEMORY.md
   - Maximum 15 entries; if more, merge adjacent topics
   - Maximum total file size: 4KB (trim entries if needed, keep most important first)
   - Do NOT introduce information not present in MEMORY.md — keep entries factual and traceable
   - Write to `memory/.summary.md` (note the leading dot — hidden file)
10. End your turn. No reports, no messages to other sessions — just stop.

## v3 — multi-session crystallization scan (after rebalance)

After the MEMORY.md / topic / .summary.md writes are done, run one quick
pass over the **finished** memory state looking for **multi-session
patterns** worth crystallizing into a new skill.

**You only see memory files** — you do NOT have the original conversation
context that produced these entries. So this scan is for patterns that
ALREADY repeated across sessions and left enough signal in memory itself.
Single-session patterns are caught by the daily-digest fallback re-prompt
(02:00) — not your job here.

Scan rule:
- Sweep MEMORY.md and topic files for entries that describe the SAME
  pattern in 3+ different contexts / dates
- Examples: "always X before Y", "remember to do Z when seeing W", a
  repeated debugging recipe, a recurring user-preference enforcement
- The pattern must NOT already be covered by an existing skill (check
  with `mavis skill list <agent>` if unsure)

If you find one:

```bash
mavis skill proposal report \
  --name <kebab-case-name> \
  --scope agent-self \
  --summary "<one-line>" \
  --rationale "<which entries support it; why no existing skill covers it; expected reuse>" \
  --evidence "<excerpt from one memory entry>" \
  --evidence "<excerpt from another memory entry>"
```

Set the channel to `memory-cleanup` (the daemon-side wiring will fill this
in based on your spawn context — you do NOT pass `--channel`).

Hard limits:
- At most 2 proposals per cleanup run. If you see more candidates, pick the
  most clearly-recurring ones; the rest will surface again next cleanup.
- If you find none, that's normal — most cleanup runs produce zero proposals.
- Do NOT spawn skill-creator yourself. The nightly skill-evolve cron will
  triage your proposal at the next 02:00 window.
- Full schema, scope decision tree, good/bad examples → load
  `skill-evolution` skill before submitting your first proposal.

Then end your turn for real.
