---
name: init-harness
description: Bootstrap a `.harness/` directory — analyze the project codebase and scaffold a multi-agent team for a coding project. Auto-loaded when the system prompt contains `<bootstrap_check>` (cold-start in a git workspace with no `.harness/`); users can also invoke via "init harness" / "bootstrap project team" / "set up agents for this repo". Coding-specific. For non-coding teams or for adding agents to an existing project, use `mavis-team` (router) and `create-agent` (writes the files).
---

# Init Harness

You're here because a coding project has no `.harness/` yet and someone wants you to bootstrap one. Your job: read enough of the codebase to know what team it needs, then write the `.harness/` files.

This skill handles the cold-start path only. **Team-design rules** (how many agents, which roles, stop conditions) live in the `mavis-team` skill — section "Team-design checklist". **Single-agent file schemas** (agent.md / config.yaml / hooks / crons) live in the `create-agent` skill. Load both before writing files.

## Execution Context

You are most likely invoked from a **dedicated worker session** that the orchestrator spawned just for this bootstrap (the orchestrator must not run init itself — that would pollute its conversation context with file scanning + writing). Run the procedure end-to-end inside this session, write the `.harness/` files, then emit a concise deliverable summary for the orchestrator to review with the user.

If you find yourself in an orchestrator session anyway (the user explicitly asked), still finish the work — but be aware the context will be heavier afterwards.

## When to use

- The system prompt contains `<bootstrap_check>`.
- The user explicitly asks to bootstrap, init, or set up a project team.

If the workspace is not a meaningful git repo or has no real code, **do not bootstrap**. Explain why.

## Bootstrap procedure

### 1. Identify the workspace shape
Single repo, monorepo, or parent dir with multiple repos. (See "Multi-repo exception" below if it's the third.)

### 2. Inspect the codebase — evidence over guesses
- Manifests: `package.json`, `go.mod`, `Cargo.toml`, `pyproject.toml`
- Top-level directories and dominant languages / frameworks
- CI/CD configuration
- Recently active areas (last few weeks of commits)

### 3. Decide the team
Load the `mavis-team` skill and apply its **Team-design checklist** (section 2). The default for a coding project:
- Orchestrator (the Harness itself) + `developer` + `tester` always.
- `code-reviewer` if the project has quality gates / external delivery / security surface.
- 1–4 domain specialists named by responsibility (e.g. `daemon-expert`, `ui-expert`).
- 3–7 agents total. Resist padding.

You don't need user consent here — `<bootstrap_check>` is the consent. But the deliverable summary at the end should let the user veto specific reins.

### 4. Write the files
For each rein, load the `create-agent` skill and follow it with `target=project --project <repo-path>`. This puts the file in `<repo>/.harness/reins/<name>/agent.md` instead of `~/.mavis/agents/`.

Then write the orchestrator (Harness) file at `<repo>/.harness/agent.md` — same `agent.md` schema as a rein, just at the Harness level. Its body is the orchestrator's routing brain (when it handles directly vs delegates, what acceptance looks like). **Do NOT list reins inside the orchestrator's body** — the daemon injects the team roster at runtime, and a hand-maintained list will drift.

### 5. Add coding-specific extras (only what the project actually needs)

These are coding-project fixtures that don't make sense for a generic agent — keep them in `.harness/`:

| File / dir | Add when |
|---|---|
| `.harness/docs/<topic>.md` | Project standards (code style, git workflow, test policy) — link from `agent.md` bodies instead of inlining |
| `.harness/changelogs/YYYY-MM-DD.md` | Project tracks per-day commit changelogs |
| `.harness/hooks/<name>.md` | Project-wide tool gate (use `mavis hook create` so the daemon validates as it writes) |
| `.harness/crons/<name>.md` | Project-wide scheduled task |
| `.harness/memory/MEMORY.md` | Shared team memory across reins |

Skip empty directories.

### 6. Tell the user
Print:
1. Path of the created `.harness/` directory.
2. Roster summary (orchestrator + each rein with one-line description).
3. Reminder: commit `.harness/` to git — the directory IS the team definition.
4. How to grow it later: load `create-agent` to add a rein; load `mavis-team` to use the team for tasks.

## Multi-repo exception

If the workspace is a parent directory containing multiple independent git repos:

- Create a root `.harness/` that explains what each repo is for and how they relate.
- Bootstrap each real sub-repo separately with its own local `.harness/`.
- Keep the root Harness focused on cross-repo navigation and coordination.

## Guardrails

- Base the team on what the repo actually needs, not on a generic template.
- Keep `agent.md` bodies short and operational — link to `docs/` instead of inlining rules.
- Prefer fewer specialists with clear ownership over many overlapping agents.
- If you're unsure whether a specialist is needed, leave it out.
- Do NOT hardcode a `git commit` step into the bootstrap itself — let the user commit when they're ready.
