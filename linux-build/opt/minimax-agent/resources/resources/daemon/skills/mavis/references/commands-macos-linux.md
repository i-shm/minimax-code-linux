# mavis Commands — macOS / Linux

Shell: bash or zsh. Use these recipes only on `darwin` / `linux` platforms.

Do not copy these snippets into Windows PowerShell. Windows has a separate reference: `commands-windows-powershell.md`.

The recipes below assume the calling agent has the standard environment variables available
(`PARENT_SESSION_ID`, `agentName`, `CURRENT_SESSION_ID`). When they're not set, substitute
the literal values directly.

## agent-inspect

```bash
mavis agent info "$agentName"
mavis skill list "$agentName"
```

## report-back-to-parent

```bash
mavis communication send \
  --to "$PARENT_SESSION_ID" \
  --command prompt \
  --content "Task complete. Summary: ..."
```

For a multi-line summary, prefer a heredoc to avoid shell quoting issues:

```bash
mavis communication send \
  --to "$PARENT_SESSION_ID" \
  --command prompt \
  --content "$(cat <<'EOF'
Task complete.

- Step 1: …
- Step 2: …
EOF
)"
```

## cron-poll-ci

Stay in the current session and poll periodically. Use `cron self` (not `cron create`) —
it auto-injects session-id, agent name, and TTL so you don't have to.

```bash
mavis cron self check-ci --every 5m \
  --prompt "Check CI. If done, report and delete this cron."
```

## cron-reminder

Schedule a user-requested reminder. The default `new` session mode does not require any
existing session context.

```bash
mavis cron create "$agentName" morning-alarm \
  --schedule "0 8 * * *" --timezone "Asia/Shanghai" \
  --prompt "Good morning! Time to start the day."
```

## hook-list

```bash
mavis hook list --agent "$agentName" --human
```

## hook-test

```bash
mavis hook test "$agentName:tool-guard" \
  --input  '{"agentName":"'"$agentName"'","sessionId":"ses_123","toolName":"bash","toolArgs":{"command":"git status"}}' \
  --output '{"toolArgs":{"command":"git status"},"metadata":{}}'
```

## memory-append

Use a quoted heredoc to keep multi-line content safe. Do not paste secrets.

```bash
mavis memory append "$agentName" --content "$(cat <<'EOF'
### <topic> (<date>)
<lesson>
WHY: <why this matters later>
EOF
)"
```
