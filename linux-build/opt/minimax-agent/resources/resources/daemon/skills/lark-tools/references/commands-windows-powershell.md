# lark-tools Commands — Windows PowerShell

Shell: Windows PowerShell 5.1+ or PowerShell 7+. Use these recipes only on `win32`.

Do not use bash syntax in PowerShell: no `command -v`, no `cat`, no `sed`, no `jq` pipelines, no `2>/dev/null`. Prefer PowerShell cmdlets, `Join-Path`, and `ConvertFrom-Json`.

**Encoding**: Always pass `-Encoding UTF8` when using `Get-Content` or `Set-Content`. Windows
PowerShell 5.1 defaults to the system ANSI code page (e.g. GBK on Chinese Windows), which
silently corrupts UTF-8 content. Prefer Read/Write/Edit tools for file content operations.

## install-lark-cli

```powershell
if (-not (Get-Command lark-cli -ErrorAction SilentlyContinue)) {
  Write-Host "lark-cli not found, installing @larksuite/cli globally..."
  npm install -g @larksuite/cli
}
lark-cli --version    # confirm install succeeded
```

If the install fails because of permissions, prefer a per-user prefix over running PowerShell as Administrator without telling the user first.

## resolve-daemon-url

```powershell
$DataDir = if ($env:__MAVIS_PARENT_DATA_DIR) {
  $env:__MAVIS_PARENT_DATA_DIR
} else {
  Join-Path $env:USERPROFILE ".mavis"
}

$PortFile = Join-Path $DataDir "daemon.port"
if (Test-Path $PortFile) {
  $DaemonPort = (Get-Content -Path $PortFile -Raw -Encoding UTF8).Trim()
} else {
  $StatusLine = (mavis status 2>$null) `
    | Select-String -Pattern '^Port:\s*' `
    | Select-Object -First 1
  if ($StatusLine) {
    $DaemonPort = ($StatusLine -replace '^Port:\s*', '').Trim()
  } else {
    $DaemonPort = $null
  }
}

if (-not $DaemonPort) {
  Write-Error "Could not resolve Mavis daemon port; check <agent-context> daemonPort or run mavis status"
  return
}

$DaemonBase = "http://127.0.0.1:$DaemonPort"
```

## bot-status

```powershell
$Status = (lark-cli auth status 2>$null) | ConvertFrom-Json
$Status | Select-Object appId, identity, userOpenId, userName, tokenStatus, scope
```

## auth-status

```powershell
$Status = (lark-cli auth status 2>$null) | ConvertFrom-Json
$Status | Select-Object appId, identity, userOpenId, userName, tokenStatus, scope, expiresAt
```

## onboard-start

```powershell
$Body  = @{ name = "main" } | ConvertTo-Json -Compress
$Start = Invoke-RestMethod -Method Post `
  -Uri "$DaemonBase/mavis/api/lark/onboard/start" `
  -ContentType 'application/json' `
  -Body $Body
$SessionId = $Start.sessionId
$Start | Select-Object sessionId, verificationUriComplete, userCode, expiresIn, intervalSec
```

## onboard-poll

```powershell
Invoke-RestMethod -Method Get `
  -Uri "$DaemonBase/mavis/api/lark/onboard/status?sessionId=$SessionId"
```

Wait `intervalSec` seconds between calls. Stop when `.status` is `done` or you intend to abort.

## onboard-cancel

```powershell
$CancelBody = @{ sessionId = $SessionId } | ConvertTo-Json -Compress
Invoke-RestMethod -Method Post `
  -Uri "$DaemonBase/mavis/api/lark/onboard/cancel" `
  -ContentType 'application/json' `
  -Body $CancelBody
```

## Safety notes

- Use `Invoke-RestMethod` instead of `curl` — Windows ships a `curl` alias for `Invoke-WebRequest` whose flags do not match real curl, so calling `curl -X POST -d '{...}'` silently misbehaves.
- Use `py` or `python` for any Python helper scripts; `python3` is not standard on Windows.
- Do not write the device-flow token to disk.
