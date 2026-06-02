# Agent

Use this doc for agent inventory, configuration, identity, status, logs, and skill
visibility.

## Commands

### List agents

```bash
mavis agent list
mavis agent ls
mavis list
```

Flags:

- `--limit <n>` default `20`
- `--offset <n>` default `0`
- `--project <path>` include harness agents whose `source_project` matches the filesystem path
- `--search <query>` search by name or content
- `-h` human-readable table; default output is JSON

Key rule: `--project` matches by filesystem path prefix, not agent slug.

### Show details

```bash
mavis agent info <nameOrId>
```

Returns name, role, default status, workspace, root session ID, persona, system prompt.

### Update config

```bash
mavis agent update <nameOrId>
```

Flags:

- `--workspace <path>`
- `--persona <text>`
- `--system-prompt <text>`
- `--display-name <name>`

### Logs and status

```bash
mavis agent logs [nameOrId]
mavis agent status <nameOrId>
```

`mavis agent logs` without an agent shows daemon logs. `-n, --lines <number>` controls tail size.

## Identity

```bash
mavis agent identity show <name>
mavis agent identity set <name> --display-name <name> --avatar <path>
mavis agent identity delete <name>
```

Identity fields: `display_name`, `avatar`.

## Skill Discovery

```bash
mavis skill list [agentName]
mavis skill ls [agentName]
```

Defaults to `main` if omitted.

Flags:

- `--scope <scope>`: `agent` or `global`

Output fields:

- skill name
- scope: `agent` or `global`
- truncated description
- agent skills directory path

Scope semantics:

- `global`: shared skill directory, visible to all agents
- `agent`: agent-private skill directory

## Use This Doc When

- you need to inspect or edit agent configuration
- you need to know what an agent is allowed to use
- you need logs/status rather than session/message history
