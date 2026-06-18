---
name: create-agent
description: "Create one agent on disk. Load when you need to add a new role to the team — typically called by `mavis-team` (when planning analysis says no existing agent fits and the user has consented), by `init` (when bootstrapping `.harness/reins/`), or directly when the user says 'add an agent for X' / 'new an agent' / '加一个 agent' / '建一个 rein'. Two output paths: `~/.mavis/agents/<name>/` (default — cross-project helper) or `<repo>/.harness/reins/<name>/` (when caller specifies project target — coding project rein). Do NOT load to decide WHETHER to create (that lives in `mavis-team` router) or to create a skill (use `skill-creator`)."
descriptions:
  zh-Hans: "在磁盘上创建一个 Agent，可用于补充团队角色、初始化项目 rein，或按用户要求新增 Agent。"
displayNames:
  zh-Hans: "创建 Agent"
---

# Create Agent

You're here because someone — `mavis-team` after consent, `init` during bootstrap, or the user directly — decided to add a new agent. Your job: write the files so it boots correctly. **No design debate at this layer** — that already happened upstream.

## Mandatory platform command router

This skill keeps shell recipes OUT of the body of `SKILL.md`. Before you run any command, select exactly one platform command reference and use only that file's recipes.

Router:

1. Read `<agent-context>.platform`.
2. If `platform` is `win32`:
   - REQUIRED: read `references/commands-windows-powershell.md`.
   - Use PowerShell recipes from that file only.
   - Do NOT use bash snippets, `mkdir -p`, `$(pwd)`, or `rm -rf`.
3. If `platform` is `darwin` or `linux`:
   - REQUIRED: read `references/commands-macos-linux.md`.
   - Use bash/zsh recipes from that file only.
4. If `platform` is missing or unknown:
   - Do a tiny preflight to identify the shell/platform before running anything.
   - If still unclear, ask the user which environment is running the command.

Never translate shell commands across platforms from memory. The platform reference files own the recipes for every step that touches the filesystem (`scaffold-project-rein`, `cwd`, `verify-project-rein`, `delete-project-rein`).

## Pick the path before you touch the disk

| Caller / situation | Where it goes | How to scaffold |
|---|---|---|
| Default. Reusable across the user's projects (`coder`, `verifier`, custom helper). | `~/.mavis/agents/<name>/` | `mavis agent new <name>` then edit `agent.md` |
| Project rein. Caller passed `target=project` (init, or user said "add a rein to this project"). | `<repo>/.harness/reins/<name>/` | Use the `scaffold-project-rein` recipe from the platform command reference, then write `agent.md` directly |

If you're not sure which, ask the upstream caller — don't guess.

## Five steps

### 1. Pick the name

- **kebab-case**, maps 1:1 to the directory name.
- Name by **responsibility**, not seniority: `payments-expert` ✓ / `senior-dev` ✗.
- Check it's free: `mavis agent info <name>` returning details = name taken, pick another.

### 2. Scaffold

**Standalone agent**:
```bash
mavis agent new <name> \
  --description "<one line — what role this agent plays>" \
  --display-name "<friendly name>"
```
The CLI writes a generic `agent.md` you'll replace in step 3.

**Project rein**:

Use the `scaffold-project-rein` recipe from the selected platform command reference (it creates `.harness/reins/<name>/` for the current platform). No CLI for this path — write `agent.md` directly in step 3.

### 3. Write `agent.md` (this IS the system prompt)

The body must answer four questions in order. Skipping any leaves the agent vague.

```markdown
---
name: <name>                   # MUST match the folder name
description: <one concrete sentence — shown to the orchestrator when picking who to delegate to>
---

# <Display Name>

You are the <role> for <project / scope>.

## Scope
- Own: <paths / systems / responsibilities>
- Don't own: <what you hand off, to whom>

## How you work
- <key convention>
- <link to project docs instead of inlining rules>

## Stop when
- <concrete checklist — "build passes, tests pass, MR opened">
```

**Bad body** (it gets ignored):
> "You are a senior developer who writes high-quality, maintainable code."

**Good body** (drives behavior):
> "You own `packages/api`. You hand off UI work to `ui-expert` and infra changes to `daemon-expert`. You're done when the change builds, the affected package's tests pass, and you've posted a one-line summary to the orchestrator."

### 4. Add the optional pieces — only what you need

| File | Add when | How |
|---|---|---|
| `config.yaml` | The default model is wrong for this role | `model: <provider>/<model>` (and `thinking:` block for reasoning models — check `~/.mavis/config.yaml` for the exact shape per model) |
| `PERSONA.md` | Tone / voice / brevity matters (frontend chat agent vs backend grunt) | Body shapes voice, NOT operational rules — those go in `agent.md` |
| `skills/<name>/` | Agent needs a private skill | Use the `skill-creator` skill, don't hand-roll |
| `hooks/<name>.md` | Need a tool gate | Use `mavis hook create ...` (load `mavis` skill → `references/hook.md` for the schema) |
| `crons/<name>.md` | Recurring task this agent owns | Use `mavis cron create ...` (load `mavis` skill → `references/cron.md`) |

Skip what you don't need. Empty folders just create noise.

### 5. Verify it boots

```bash
mavis agent info <name>      # prints prompt + config — proves the file parsed
mavis agent list --human     # standalone agent shows up here
mavis skill list <name>      # what skills the agent can see
```

To list project reins, use the `verify-project-rein` recipe from the selected platform command reference (it passes the current working directory to `mavis agent list --project ...`).

If the agent is missing from the list:

| Symptom | Fix |
|---|---|
| `mavis agent info` works but list doesn't show it | YAML frontmatter probably broken — check `name:` matches folder, frontmatter closed with second `---` |
| Project rein not visible | Folder is `.harness/reins/<name>/` (plural `reins`, NOT `rein`) and contains `agent.md` |
| Frontmatter parse error in logs | No tab indent. `name:` and `description:` are plain strings on their own lines |

## After creation: report up

- If `mavis-team` called you: write the new agent's name into the plan / continue routing.
- If `init` called you: continue the bootstrap procedure.
- If the user called you: confirm the agent was created (give the path), then ask what to do with it (start a session, plug it into a plan, etc.).

## Pitfalls that bite later

| Pitfall | Why it bites | Avoid by |
|---|---|---|
| `description:` is one of "helpful assistant" / "general-purpose agent" / vague | Orchestrator can't pick this agent for delegation — every task looks equally relevant | One concrete sentence about the role's actual scope |
| Two agents with overlapping ownership | Routing becomes random; you can't predict who picks up the task | Tighten both `agent.md` bodies — make scope unambiguous before adding the second |
| Stop condition is "task is complete" | Agent reports done without verifying anything | Replace with measurable: "build passes, tests pass, MR opened, summary posted" |
| Inline whole project conventions in `agent.md` body | Body bloats; updates require editing each agent | Link to a single project doc instead (`see .harness/docs/code-standards.md`) |
| Listing reins inside the orchestrator's `agent.md` | The daemon already injects the team roster at runtime — manual lists drift | Don't list. Each rein's `description:` field is what the orchestrator reads |

## What this skill is NOT for

- Deciding **whether** to add an agent or what roles to add → that analysis lives in `mavis-team` (its router/team-design section)
- Bootstrapping a brand new project's `.harness/` from scratch → use `init` (it calls back here for each rein)
- Creating a new skill → use `skill-creator`
- Editing an existing agent's prompt → just open `<dataDir>/agents/<name>/agent.md` (or the `.harness/reins/<name>/agent.md`) and edit it
- Deleting an agent → `mavis agent delete <name>` (standalone) or use the `delete-project-rein` recipe from the selected platform command reference, then commit (project rein)
