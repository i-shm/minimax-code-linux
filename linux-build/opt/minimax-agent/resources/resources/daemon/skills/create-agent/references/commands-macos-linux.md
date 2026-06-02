# create-agent Commands — macOS / Linux

Shell: bash or zsh. Use these recipes only on `darwin` / `linux` platforms.

Do not copy these snippets into Windows PowerShell. Windows has a separate reference: `commands-windows-powershell.md`.

## scaffold-project-rein

Create the `.harness/reins/<name>/` directory inside the project repo (run from the repo root).

```bash
mkdir -p ".harness/reins/<name>"
```

Then write `agent.md` directly inside the new directory (use the body schema in step 3).

## cwd

When the procedure asks for the current working directory:

```bash
PROJECT_DIR="$(pwd)"
```

## verify-project-rein

```bash
mavis agent list --project "${PROJECT_DIR}" --human
```

If you skipped `cwd` because you already know the absolute path, pass it directly to `--project`.

## delete-project-rein

The agent should be deleted **recoverably** so the user can restore the directory if they change their mind. Do NOT use `rm -rf`.

```bash
mavis-trash ".harness/reins/<name>"
```

If the project does not have `mavis-trash` available, fall back to moving the folder into a backup location instead of permanently deleting it:

```bash
BACKUP_DIR="$(pwd)/.harness/.trash"
mkdir -p "${BACKUP_DIR}"
mv ".harness/reins/<name>" "${BACKUP_DIR}/<name>-$(date +%Y%m%dT%H%M%S)"
```

Commit the deletion afterwards.
