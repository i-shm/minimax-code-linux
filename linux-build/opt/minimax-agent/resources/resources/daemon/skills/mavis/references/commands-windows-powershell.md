# mavis Commands — Windows PowerShell

Shell: Windows PowerShell 5.1+ or PowerShell 7+. Use these recipes only on `win32`.

Do not use bash syntax in PowerShell: no `cat <<EOF` heredocs, no `2>/dev/null`, no
single-quoted multi-line strings with `$VAR` expansion. PowerShell single-quoted strings are
literal — use `@'…'@` for safe multi-line content, and `$env:VAR` for environment variables.

The recipes below assume the calling agent has the standard environment variables available
(`PARENT_SESSION_ID`, `agentName`, `CURRENT_SESSION_ID`). When they're not set, substitute
the literal values directly.

## agent-inspect

```powershell
mavis agent info $env:agentName
mavis skill list $env:agentName
```

## report-back-to-parent

For a single line:

```powershell
mavis communication send `
  --to $env:PARENT_SESSION_ID `
  --command prompt `
  --content "Task complete. Summary: ..."
```

For multi-line content, use a single-quoted here-string. Single-quoted here-strings do NOT
interpolate variables, so the `$` characters and embedded quotes survive verbatim.

```powershell
$Report = @'
Task complete.

- Step 1: …
- Step 2: …
'@

mavis communication send `
  --to $env:PARENT_SESSION_ID `
  --command prompt `
  --content $Report
```

## cron-poll-ci

Use `cron self` (not `cron create`) — it auto-injects session-id, agent name, and TTL.

```powershell
mavis cron self check-ci --every 5m `
  --prompt "Check CI. If done, report and delete this cron."
```

## cron-reminder

```powershell
mavis cron create $env:agentName morning-alarm `
  --schedule "0 8 * * *" --timezone "Asia/Shanghai" `
  --prompt "Good morning! Time to start the day."
```

## hook-list

```powershell
mavis hook list --agent $env:agentName --human
```

## hook-test

```powershell
$HookId = "$env:agentName:tool-guard"

$Input = @{
  agentName = $env:agentName
  sessionId = "ses_123"
  toolName  = "bash"
  toolArgs  = @{ command = "git status" }
} | ConvertTo-Json -Compress

$Output = @{
  toolArgs = @{ command = "git status" }
  metadata = @{}
} | ConvertTo-Json -Compress

mavis hook test $HookId --input $Input --output $Output
```

## memory-append

```powershell
$Memory = @'
### <topic> (<date>)
<lesson>
WHY: <why this matters later>
'@

mavis memory append $env:agentName --content $Memory
```

## Safety notes

- Do not write secrets to memory or hook payloads.
- Use `py` or `python` for Python helpers; `python3` is not standard on Windows.
- The PowerShell back-tick (`` ` ``) is the line continuation character — do not paste it as `\` from bash.
