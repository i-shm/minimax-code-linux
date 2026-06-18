# create-agent Commands — Windows PowerShell

Shell: Windows PowerShell 5.1+ or PowerShell 7+. Use these recipes only on `win32`.

Do not use bash syntax in PowerShell: no `mkdir -p`, no `$(pwd)`, no `rm -rf`. Prefer PowerShell cmdlets and `Join-Path`.

**Encoding**: Always pass `-Encoding UTF8` when using `Get-Content` or `Set-Content`. Windows
PowerShell 5.1 defaults to the system ANSI code page (e.g. GBK on Chinese Windows), which
silently corrupts UTF-8 content. Prefer Read/Write/Edit tools for file content operations.

## scaffold-project-rein

Create the `.harness/reins/<name>/` directory inside the project repo (run from the repo root).

```powershell
$ReinPath = Join-Path $PWD.Path ".harness\reins\<name>"
New-Item -ItemType Directory -Force -Path $ReinPath | Out-Null
```

Then write `agent.md` directly inside the new directory (use the body schema in step 3).

## cwd

When the procedure asks for the current working directory:

```powershell
$ProjectDir = $PWD.Path
```

## verify-project-rein

```powershell
mavis agent list --project $ProjectDir --human
```

If you skipped `cwd` because you already know the absolute path, pass it directly to `--project`.

## delete-project-rein

The agent should be deleted **recoverably** so the user can restore the directory if they change their mind. Do NOT use `Remove-Item -Recurse -Force` against the rein.

```powershell
mavis-trash (Join-Path $PWD.Path ".harness\reins\<name>")
```

If `mavis-trash` is unavailable on Windows, move the folder into a backup directory instead of permanently deleting it:

```powershell
$Backup = Join-Path $PWD.Path ".harness\.trash"
New-Item -ItemType Directory -Force -Path $Backup | Out-Null
$Stamp  = Get-Date -Format "yyyyMMddTHHmmss"
Move-Item -Path (Join-Path $PWD.Path ".harness\reins\<name>") `
          -Destination (Join-Path $Backup "<name>-$Stamp")
```

Commit the deletion afterwards.

## Safety notes

- Do not invoke `rm`, `rmdir`, `del`, or legacy `cmd /c` commands; PowerShell scripts must use cmdlets.
- Use `py` or `python` for Python scripts on Windows; `python3` is not standard.
