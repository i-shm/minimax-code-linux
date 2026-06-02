# skill-creator Commands — macOS / Linux

Shell: bash or zsh. Use these recipes only on `darwin` / `linux` platforms.

Do not copy these snippets into Windows PowerShell. Windows has a separate reference: `commands-windows-powershell.md`.

## list-skills

```bash
mavis skill list
```

## locate-skill-dir

Resolve the skill-creator install directory so subsequent commands can address bundled scripts.

```bash
SKILL_DIR=$(dirname "$(mavis skill show skill-creator | jq -r '.location')")
```

If `jq` is not installed, parse the JSON in another way (e.g. `python3 -c 'import json,sys;print(json.load(sys.stdin)["location"])'`).

## run-lint

```bash
node "$SKILL_DIR/scripts/lint-skill.js" <path/to/new-skill/>
```

Run after `locate-skill-dir`. Replace `<path/to/new-skill/>` with the absolute path of the skill you just authored.

## eval-scratch-dir

Pick a writable scratch directory for eval YAML and baseline outputs.

```bash
EVAL_SCRATCH="${TMPDIR:-/tmp}"
```

Use `${EVAL_SCRATCH}` everywhere the procedure mentions a scratch path. Do not hardcode `/tmp/` because some sandboxes set `TMPDIR` to a different location.

## write-eval-yaml

```bash
SKILL_NAME=<new-skill-name>
SKILL_PATH=<absolute-path-to-new-skill>
EVAL_PROMPT='<the eval prompt — keep user language>'
EVAL_YAML="${EVAL_SCRATCH}/eval-${SKILL_NAME}.yaml"

cp "${SKILL_DIR}/plans/eval-skill.template.yaml" "${EVAL_YAML}"

# Substitute the placeholders in place. Quote the values so spaces survive.
sed -i.bak \
  -e "s|<SKILL_NAME>|${SKILL_NAME}|g" \
  -e "s|<SKILL_PATH>|${SKILL_PATH}|g" \
  -e "s|<EVAL_PROMPT>|${EVAL_PROMPT}|g" \
  "${EVAL_YAML}"
rm "${EVAL_YAML}.bak"
```

If the eval prompt contains characters that confuse `sed` (`|`, `&`, etc.), open `${EVAL_YAML}` in an editor and fill in the placeholders by hand.

## run-eval

```bash
mavis team plan run "${EVAL_YAML}"
```

## baseline-output-paths

When Team Engine is unavailable, write Path B subagent outputs under the same scratch dir:

```bash
mkdir -p "${EVAL_SCRATCH}/eval-${SKILL_NAME}"

WITH_SKILL_OUTPUT="${EVAL_SCRATCH}/eval-${SKILL_NAME}/with-skill.md"
BASELINE_OUTPUT="${EVAL_SCRATCH}/eval-${SKILL_NAME}/baseline.md"
```

Pass `${WITH_SKILL_OUTPUT}` and `${BASELINE_OUTPUT}` to the subagent prompts.
