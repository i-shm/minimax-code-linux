# Skill Management

Use this doc for skill inventory, installation, creation, and management.

## Skill Types

| Type | Source of truth / Location | Visibility |
| --- | --- | --- |
| Built-in | Source: `packages/daemon/skills/<name>/SKILL.md`; runtime copy: `~/.mavis/.builtin-skills/<name>/SKILL.md` | All agents, ships with daemon |
| User (global) | `~/.mavis/skills/<name>/SKILL.md` | All agents, user-installed |
| Agent-private | `~/.mavis/agents/<agent>/skills/<name>/SKILL.md` | One agent only |

Built-in skill rule: edit the repo source first, then sync the runtime copy for immediate effect.
The runtime copy is regenerated from repo on daemon release and is not the source of truth.

## Commands

```bash
mavis skill list [agent] -H              # list skills visible to an agent (default: primary agent)
mavis skill list [agent] --scope agent   # only agent-private skills
mavis skill list [agent] --scope global  # only global / built-in-visible skills
mavis skill list --all                   # all skills across all agents
mavis skill show <name> [-a <agent>] -H  # show skill metadata and content
mavis skill install <git-url> [-a <agent>]  # install from Git URL
mavis skill create <name> -a <agent> --file ./SKILL.md
mavis skill update <name> -a <agent> --file ./SKILL.md
mavis skill delete <name> -a <agent>
mavis skill copy <name> -a <agent>       # copy global skill to agent-private
```

## Notes

- Skills take effect in the **next session** — no daemon restart needed.
- Installing or updating a same-name skill may replace the existing copy; inspect with `mavis skill show <name> -H` after changes.
- To **create or improve** a skill interactively, delegate to the `skill-creator` skill.
- For `mavis skill signal ...` and built-in skill evolution workflows, read `references/skill-evolution.md`.

## Use This Doc When

- you need to list, inspect, install, or manage skills
- you need to know where skill files live on disk
- you need skill scope semantics (global vs agent-private)
