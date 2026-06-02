# Internal Skills

Daemon-internal scheduled tasks. These are **not** user-visible or agent-visible.

- Physically isolated from builtin skills (separate source dir, store, and scheduler)
- Scheduled via cron expressions in each skill's SKILL.md frontmatter
- Migrated skills will be added by subsequent tasks

## Security model

The `/api/internal-skill/*` HTTP routes and `mavis internal-skill` CLI commands
are loopback-only — they bind to `127.0.0.1` and have no per-request auth.
Consumers MUST treat this surface like the rest of the daemon API: trusted
local only. Do NOT expose the daemon over a non-loopback socket without
adding an auth layer; doing so would surface internal task names to anyone
who can reach the API.
