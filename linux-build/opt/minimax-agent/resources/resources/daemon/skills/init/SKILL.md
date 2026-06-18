---
name: init
description: Bootstrap a coding project for AI agents — generate the root `AGENTS.md` (per agents.md spec, consumed by OpenCode/Codex/Cursor/Aider/Devin/Gemini CLI/…) plus a `.harness/` directory with a multi-agent team. Auto-loaded when the system prompt contains `<bootstrap_check>` (cold-start in a git workspace with no `.harness/`); users can also invoke via `/init` or natural language like "init harness" / "bootstrap project team" / "set up agents for this repo". Coding-specific. For non-coding teams or for adding agents to an existing project, use `mavis-team` (router) and `create-agent` (writes the files).
descriptions:
  zh-Hans: "为代码项目初始化 AI Agent 配置，生成根目录 AGENTS.md 和 .harness 多 Agent 团队。"
displayNames:
  zh-Hans: "初始化"
---

# Init

You're here because a coding project needs an agent bootstrap and someone wants you to do it. Two deliverables, in order:

1. **`AGENTS.md` at the repo root** — the open agents.md standard (https://agents.md). One file, consumed by every major AI coding agent. Highest leverage.
2. **`.harness/` directory** — Mavis multi-agent team for ongoing collaboration. Coding-specific.

This skill handles the cold-start path. **Team-design rules** (how many agents, which roles, stop conditions) live in the `mavis-team` skill — section "Team-design checklist". **Single-agent file schemas** (agent.md / config.yaml / hooks / crons) live in the `create-agent` skill. Load both before writing files.

## Execution Context

You are most likely invoked from a **dedicated worker session** that the orchestrator spawned just for this bootstrap (the orchestrator must not run init itself — that would pollute its conversation context with file scanning + writing). Run the procedure end-to-end inside this session, write the files, then emit a concise deliverable summary for the orchestrator to review with the user.

If you find yourself in an orchestrator session anyway (the user explicitly asked), still finish the work — but be aware the context will be heavier afterwards.

## When to use

- The system prompt contains `<bootstrap_check>`.
- The user runs `/init` from the UI palette.
- The user explicitly asks to bootstrap, init, or set up a project team.

If the workspace is not a meaningful git repo or has no real code, **do not bootstrap**. Explain why.

## Bootstrap procedure

### 1. Identify the workspace shape

Single repo, monorepo, or parent dir with multiple repos. (See "Multi-repo exception" below if it's the third.)

### 2. Inspect the codebase — evidence over guesses

Detect the ecosystem by manifest file (first match wins). First-class support:

| Ecosystem | Manifest | Install / Test / Build commands |
|---|---|---|
| Node.js | `package.json` | Read `scripts.{dev,build,test,lint,typecheck}`; package manager from `packageManager` field or `pnpm-lock.yaml` / `yarn.lock` / `package-lock.json` |
| Python | `pyproject.toml` | Read `[tool.poetry.scripts]` / `[project.scripts]`; or fall back to `pytest`, `ruff`, `mypy` if those configs exist |
| Rust | `Cargo.toml` | `cargo build`, `cargo test`, `cargo clippy`, `cargo fmt` |
| Go | `go.mod` | `go build ./...`, `go test ./...`, `go vet ./...` |

For any other ecosystem (Java/Maven, Ruby/Bundler, PHP/Composer, …) write the AGENTS.md sections with placeholders and tell the user to fill them in.

Also inspect:
- Top-level directories and their purpose
- CI/CD configuration (`.github/workflows/`, `.gitlab-ci.yml`, `.circleci/`) for the canonical test invocation
- `.eslintrc*` / `.prettierrc*` / `pyproject.toml [tool.ruff]` / `rustfmt.toml` for code style
- Default branch via `git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null || git config init.defaultBranch || echo main` (works offline and across locales; the legacy `git remote show origin` form requires network reachability AND an English-locale `HEAD branch:` line)
- Recently active areas (last few weeks of commits) — informs which reins to spawn

### 3. Generate the root `AGENTS.md`

Path: `<repo-root>/AGENTS.md`. **No subdirectory, no symlinks.** First-class for every AGENTS.md-aware agent.

#### 3a. Pre-write check

- **File does not exist** → write the full template (step 3b).
- **File exists** → **ASK the user** which path to take:
  1. **Skip** — leave the existing file untouched (default if the user is silent).
  2. **Overwrite (with backup)** — copy current to `AGENTS.md.bak.<unix-ts>` then write the fresh template.
  3. **Show diff** — print a unified diff between the existing file and the proposed template; user copies the edits they want by hand.

  **Pause and do not write or modify any file until the user explicitly picks 1, 2, or 3** (or any phrasing you can confidently map to one of the three). "Default if silent = skip" is a fallback only after the user has actually been asked and remains silent across the same turn — never a license to decide for them up-front.

Do not invent a fourth path. Do not write a "Mavis-managed" block — the file belongs to the user.

#### 3b. Template

Fill the placeholders below from step 2 detection. Trim sections that don't apply (e.g. `Typecheck` only if the project has TypeScript). Keep it tight — aim for under 80 lines.

```md
# AGENTS.md

<one-line project description — from package.json `description`, Cargo.toml `description`, pyproject `description`, or the first sentence of README.md>

## Setup commands

- Install deps: `<pnpm install | npm install | poetry install | cargo build | go mod download>`
- Start dev:    `<pnpm dev | npm run dev | uvicorn ... | cargo run | go run ./...>`
- Build:        `<pnpm build | cargo build --release | go build ./...>`
- Test:         `<pnpm test | pytest | cargo test | go test ./...>`
- Lint:         `<pnpm lint | ruff check | cargo clippy | go vet ./...>`
- Typecheck:    `<pnpm typecheck | mypy . | …>`           # omit if not applicable

## Project layout

<auto-detected top-level directories, one per line, with a short purpose>
- `packages/` — workspace packages
- `apps/` — deployable apps
- `scripts/` — repo utility scripts
- `docs/` — long-form documentation

## Code style

<3-5 lines summarising the inferred conventions>
- TypeScript strict mode (`tsconfig.json: strict: true`)
- Prettier: single quotes, 100-char width
- ESLint config: `.eslintrc.js`
- Run `<lint:fix command>` before committing

## Testing instructions

- Unit tests: `<test command>` (<framework, e.g. Vitest / pytest / cargo test>)
- E2E tests:  `<e2e command>` (<Playwright / Cypress / …>)         # omit if none
- Add tests for every new behavior — see existing `*.test.<ext>` files in the same package
- All tests must pass before opening a PR

## PR & commit conventions

- Branch from `<default-branch>`; never push to it directly
- Commit message: conventional commits (`feat:` / `fix:` / `docs:` / `refactor:`)
- Open PR via `<gh pr create | glab mr create>` once CI is green

## Security

- Never commit secrets — `.env` is in `.gitignore`
- <add any security-policy hints inferred from `SECURITY.md`, `package.json` engines, etc.>
```

### 4. Generate the `.harness/` team

Load the `mavis-team` skill and apply its **Team-design checklist** (section 2). The default for a coding project:

- Orchestrator (the Harness itself) + `developer` + `tester` always.
- `code-reviewer` if the project has quality gates / external delivery / security surface.
- 1–4 domain specialists named by responsibility (e.g. `daemon-expert`, `ui-expert`).
- 3–7 agents total. Resist padding.

You don't need user consent here — `<bootstrap_check>` is the consent. But the deliverable summary at the end should let the user veto specific reins.

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

1. Whether `AGENTS.md` was created, overwritten (with backup path), or skipped.
2. Path of the created `.harness/` directory.
3. Roster summary (orchestrator + each rein with one-line description).
4. Reminder: commit `AGENTS.md` and `.harness/` to git — both files ARE the team definition.
5. How to grow it later: load `create-agent` to add a rein; load `mavis-team` to use the team for tasks.

## Multi-repo exception

If the workspace is a parent directory containing multiple independent git repos:

- Create a root `AGENTS.md` + `.harness/` that explains what each repo is for and how they relate.
- Bootstrap each real sub-repo separately with its own local `AGENTS.md` and `.harness/`.
- Keep the root Harness focused on cross-repo navigation and coordination.

## Guardrails

- Base the team and AGENTS.md content on what the repo actually needs, not on a generic template.
- Keep `agent.md` bodies short and operational — link to `docs/` instead of inlining rules.
- Prefer fewer specialists with clear ownership over many overlapping agents.
- If you're unsure whether a specialist is needed, leave it out.
- Do NOT hardcode a `git commit` step into the bootstrap itself — let the user commit when they're ready.
- Do NOT inject Mavis-branded sections into `AGENTS.md`. The file is for every agent; Mavis is just one of them.
