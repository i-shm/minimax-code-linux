---
name: mcp-onboarding
description: "Onboard a new MCP integration — collect config, handle auth, and sync skills without asking the user to run manual setup commands."
---

# MCP Onboarding

Use this skill when the user says things like:

- “帮我接入 Figma”
- “把这个 MCP 接进来”
- “配置一个新的 MCP 服务”
- “我想让 agent 能用这个外部服务”

## Goal

Hide the raw setup sequence from the user.

The user should only:
1. provide the service URL / command if needed
2. click an OAuth link **or** fill one inline auth card

The agent does the rest:
- `mavis mcp add <name> '<config>'`
- run auth
- verify auth
- run sync
- confirm the generated skill is ready (takes effect next session)

## Core Product Rule

**Do not ask the user to run `mavis mcp ...` commands manually unless they explicitly insist.**

This skill is the user-facing onboarding flow.
`mcp-cli` is the low-level management layer used by the agent behind the scenes.

## Single User-Facing Flow

### 1. Collect only missing information

Prefer presets when obvious:

| Service type | Default server id | Default config |
|---|---|---|
| Figma | `figma` | `{ "url": "https://mcp.figma.com/mcp" }` |
| Generic HTTP OAuth MCP | sanitized service name | `{ "url": "<url>" }` |
| Generic HTTP Bearer MCP | sanitized service name | `{ "url": "<url>", "auth": { "type": "bearer", "token": "<token>" } }` |
| Local stdio + env token | sanitized service name | `{ "command": "<cmd>", "args": [...], "env": { "<KEY>": "<token>" } }` |

Ask concise follow-up questions only for the fields you truly need:
- `server id`
- `url` or `command + args`
- auth mode when not inferable
- env key name for stdio token mode

Do **not** dump raw JSON to the user unless they explicitly ask.

### 2. Configure the server via CLI

Use `mavis mcp add` to write the config. The daemon validates and stores it.

Examples:

#### HTTP OAuth (Figma-style)

```bash
mavis mcp add figma '{"url": "https://mcp.figma.com/mcp"}'
```

#### HTTP Bearer token

```bash
mavis mcp add acme-api '{"url": "https://api.example.com/mcp", "auth": {"type": "bearer", "token": "<token>"}}'
```

#### stdio + env token

```bash
mavis mcp add gitlab-local '{"command": "npx", "args": ["-y", "@vendor/mcp-gitlab"], "env": {"GITLAB_TOKEN": "<token>", "GITLAB_URL": "https://gitlab.example.com"}}'
```

## Authentication Flows

### A. OAuth2 servers

Examples: Figma, generic HTTP MCP servers that expose OAuth metadata.

#### Agent behavior

1. Write the server config.
2. Run:

```bash
mavis mcp auth login <server>
```

3. Extract the returned `authUrl`.
4. Send the user a short message with a clickable markdown link:

```markdown
请点击这里完成授权： [打开授权页](<authUrl>)
```

5. After sending the link, continue to handle the rest yourself:
   - poll `mavis mcp auth status <server>`
   - when status becomes `authenticated`, immediately run `mavis mcp sync`

#### User-facing rule

The user should not need to know the command sequence. They only click the auth link.

### B. Bearer / PAT / single-token env auth

Reuse the same inline GenUI auth card pattern already used by the Figma and GitLab skills.

Output this tag when a single secret token is needed:

```xml
<genui-mcp-auth server-id="<server-id>" label="<human label>" placeholder="<token example>" help-url="<docs or settings url>" permissions="<required scopes or permissions>" />
```

If the service also needs a host field, include `default-host="..."`.

Example:

```xml
<genui-mcp-auth server-id="gitlab-local" label="GitLab Personal Access Token" placeholder="glpat-xxxxxxxxxxxxxxxxxxxx" default-host="gitlab.example.com" help-url="https://gitlab.example.com/-/user_settings/personal_access_tokens" permissions="api, read_api, read_user, read_repository, write_repository" />
```

After the user submits, you will receive a message containing a tag like:

```xml
<genui-mcp-auth server-id="gitlab-local" status="submitted" host="gitlab.example.com" token="glpat-..." />
```

Extract the values and call `mavis mcp add` with the config.

#### Important

- Never echo the token back to the user.
- Never ask the user to paste the token into terminal commands.
- Reuse the existing `genui-mcp-auth` flow; do not invent a new frontend tag.

### C. Multi-field auth beyond `host + token`

Current reusable GenUI support is only `genui-mcp-auth`.

If the integration needs extra **non-secret** fields:
- collect those fields in normal chat first
- still use `genui-mcp-auth` only for the secret token

If the integration needs multiple secrets, ask the user one concise follow-up at a time and prefer evolving the UI later rather than leaking secrets in plain text.

## Automatic Completion Sequence

After auth is ready, always complete the rest yourself:

```bash
mavis mcp auth status <server>
mavis mcp sync
mavis mcp list
```

Expected success state:
- auth status: `authenticated` or `not_required`
- generated skill: `active`
- server enabled: `enabled`

Skills take effect in the next session — no daemon restart needed.

Then tell the user:

```text
<service> 已接入完成，生成的 skill 为 mcp-<server-id>，下个 session 即可使用。
```

## Figma Preset

When the user says “接入 Figma”, use this default:

- server id: `figma`
- URL: `https://mcp.figma.com/mcp`
- auth mode: OAuth2

Flow:
1. `mavis mcp add figma '{"url": "https://mcp.figma.com/mcp"}'`
2. `mavis mcp auth login figma`
3. send the returned `authUrl`
4. wait for callback-auth success
5. `mavis mcp sync`
6. confirm `mcp-figma` skill is ready

## What Not To Do

- Do not ask the user to hand-edit `mcp.json` or any config files.
- Do not expose raw command sequences as the primary user workflow.
- Do not ask the user to run `sync` manually in the normal case.
- Do not expose raw MCP tool lists to the user as the product surface.
- Do not invent new GenUI tags when `genui-mcp-auth` is sufficient.

## Completion Message Template

Use a short completion message like:

```text
已完成接入：<service>
- server: <server-id>
- auth: <status>
- skill: mcp-<server-id>
- state: ready
```
