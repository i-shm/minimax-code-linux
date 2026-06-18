# skill-creator Commands — Windows PowerShell

Shell: Windows PowerShell 5.1+ or PowerShell 7+. Use these recipes only on `win32`.

Do not use bash syntax in PowerShell: no `mkdir -p`, no `cat <<EOF`, no `/tmp`, no `.sh` scripts, and do not assume `python3` exists. Prefer PowerShell cmdlets and `Join-Path`.

**Encoding**: Always pass `-Encoding UTF8` when using `Get-Content` or `Set-Content`. Windows
PowerShell 5.1 defaults to the system ANSI code page (e.g. GBK on Chinese Windows), which
silently corrupts UTF-8 content. Prefer Read/Write/Edit tools for file content operations.

## list-skills

```powershell
mavis skill list
```

## locate-skill-dir

Resolve the skill-creator install directory so subsequent commands can address bundled scripts.

```powershell
$skillJson = mavis skill show skill-creator | ConvertFrom-Json
$SkillDir  = Split-Path $skillJson.location -Parent
```

`ConvertFrom-Json` is built into PowerShell — no `jq` required.

## run-lint

```powershell
node (Join-Path $SkillDir "scripts/lint-skill.js") "<path\to\new-skill\>"
```

Run after `locate-skill-dir`. Replace `<path\to\new-skill\>` with the absolute path of the skill you just authored.

## eval-scratch-dir

Pick a writable scratch directory for eval YAML and baseline outputs. Do NOT use `/tmp` — Windows does not have it.

```powershell
$EvalScratch = $env:TEMP
```

Use `$EvalScratch` everywhere the procedure mentions a scratch path.

## write-eval-yaml

```powershell
$SkillName  = "<new-skill-name>"
$SkillPath  = "<absolute-path-to-new-skill>"
$EvalPrompt = "<the eval prompt — keep user language>"
$EvalYaml   = Join-Path $EvalScratch "eval-$SkillName.yaml"

Copy-Item -Path (Join-Path $SkillDir "plans/eval-skill.template.yaml") `
          -Destination $EvalYaml -Force

# Use [String]::Replace (the instance .Replace method) — it is a LITERAL
# substring replace, so backslashes in Windows paths and `$` in prompts
# survive untouched. Do NOT use the `-replace` operator here: it treats
# the RHS as a regex replacement string, where `$1` / `$&` are backrefs
# and an `[regex]::Escape`'d backslash becomes a literal double backslash
# in the output.
$content = Get-Content $EvalYaml -Raw -Encoding UTF8
$content = $content.Replace('<SKILL_NAME>',  $SkillName)
$content = $content.Replace('<SKILL_PATH>',  $SkillPath)
$content = $content.Replace('<EVAL_PROMPT>', $EvalPrompt)
Set-Content -Path $EvalYaml -Value $content -Encoding UTF8 -NoNewline
```

`.Replace(...)` is case-sensitive and takes literal strings — no escaping is required for regex metacharacters, backslashes, or `$`. The placeholders are uppercase tokens, so case-sensitive matching is correct. If a value contains a literal `<SKILL_NAME>` substring you do not want replaced, edit `$EvalYaml` by hand.

## run-eval

```powershell
mavis team plan run $EvalYaml
```

## baseline-output-paths

When Team Engine is unavailable, write Path B subagent outputs under the same scratch dir:

```powershell
$EvalDir = Join-Path $EvalScratch "eval-$SkillName"
New-Item -ItemType Directory -Force -Path $EvalDir | Out-Null

$WithSkillOutput = Join-Path $EvalDir "with-skill.md"
$BaselineOutput  = Join-Path $EvalDir "baseline.md"
```

Pass `$WithSkillOutput` and `$BaselineOutput` to the subagent prompts.

## Safety notes

- Do not add cleanup snippets with `Remove-Item`; the eval scratch dir does not need to be cleaned up immediately. If cleanup is truly required, prefer the project's recoverable trash flow over `Remove-Item`.
- Use `py` or `python` for Python scripts on Windows; `python3` is not standard.
