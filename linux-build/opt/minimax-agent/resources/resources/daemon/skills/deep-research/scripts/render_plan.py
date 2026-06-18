#!/usr/bin/env python3
"""Render Deep Research Team Engine plan from skill prompt templates.

Reads the 5 step prompt templates under skills/deep-research/steps/, substitutes
runtime placeholders (workspace paths, current_date, optional conversation
context), and emits a Team Engine plan YAML with 5 tasks that run sequentially
via max_concurrency=1 (no verifiers — file-input pipeline).

Usage:
    python render_plan.py \
        --skill-dir /path/to/deep-research \
        --workspace-dir /path/to/workspace \
        --current-date "May 29, 2026" \
        --plan-name "deep-research-foo" \
        --assigned-to general \
        --output /path/to/plan.yaml

The workspace must already contain raw_query.txt and conversations.md before the
plan starts. Every rendered step prompt receives the mandatory multi-turn
context block. Other canonical files (background.md, judgment.md, analysis.md,
research_plan.md, document.md, final.md) are produced step by step inside the
running plan.
The plan intentionally avoids depends_on edges because the Team Engine structural
floor rejects verify-skipped tasks that have downstream dependents. With
max_concurrency=1 and no dependencies, the engine schedules tasks in declaration
order while every verify-skipped task remains a legal plan-exit row.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path


STEP_TEMPLATE_FILES = {
    1: "1_background.md",
    2: "2_judgment.md",
    3: "3_analysis.md",
    4: "4_research.md",
    5: "5_writing.md",
}

STEP_OUTPUT_FILES = {
    1: "background.md",
    2: "judgment.md",
    3: "analysis.md",
    4: "document.md",
    5: "final.md",
}

STEP_TITLES = {
    1: "Step 1 — Background Search",
    2: "Step 2 — Direction Judgment",
    3: "Step 3 — Deep Analysis",
    4: "Step 4 — Deep Research",
    5: "Step 5 — Final Writing",
}

# Placeholders that the renderer substitutes inside each step template. Any
# unrecognized {leftover} after substitution that matches a known name surfaces
# as a hard error — protects against silently shipping a malformed prompt.
KNOWN_PLACEHOLDERS = {
    "current_date",
    "workspace_dir",
    "research_dir",
    "raw_query_file",
    "background_file",
    "judgment_file",
    "analysis_file",
    "research_plan_file",
    "document_file",
    "conversations_file",
    "conversation_context_block",
    "target_file",
    "target_filename",
}

VERIFY_SKIP_REASON = (
    "file-input deep-research pipeline — each step produces a canonical file "
    "for the next step; correctness is enforced by the next step's read or the "
    "owner's final delivery, not by per-step verifiers"
)


def die(message: str, code: int = 1) -> None:
    print(f"render_plan.py: {message}", file=sys.stderr)
    raise SystemExit(code)


def read_template(path: Path) -> str:
    if not path.exists():
        die(f"missing step template: {path}")
    text = path.read_text(encoding="utf-8")
    if not text.strip():
        die(f"empty step template: {path}")
    return text


def substitute(template: str, values: dict[str, str]) -> str:
    rendered = template
    for key, value in values.items():
        rendered = rendered.replace("{" + key + "}", value)
    return rendered


def validate_rendered(rendered: str, step: int) -> None:
    if not rendered.strip():
        die(f"step {step}: rendered prompt is empty")
    leftovers = sorted({m.group(1) for m in re.finditer(r"\{([A-Za-z_][A-Za-z0-9_]*)\}", rendered)})
    bad = [name for name in leftovers if name in KNOWN_PLACEHOLDERS]
    if bad:
        die(f"step {step}: unresolved placeholders: {', '.join(bad)}")


def render_step_prompt(skill_dir: Path, step: int, values: dict[str, str]) -> str:
    template_path = skill_dir / "steps" / STEP_TEMPLATE_FILES[step]
    rendered = substitute(read_template(template_path), values).strip() + "\n"
    validate_rendered(rendered, step)
    return rendered


def read_required_workspace_file(workspace_dir: Path, filename: str) -> str:
    path = workspace_dir / filename
    if not path.exists():
        die(f"workspace must contain non-empty {filename} before rendering: {path}")
    text = path.read_text(encoding="utf-8")
    if not text.strip():
        die(f"workspace must contain non-empty {filename} before rendering: {path}")
    return text


def conversation_context_block(workspace_dir: Path, step: int) -> str:
    conversations_file = workspace_dir / "conversations.md"
    read_required_workspace_file(workspace_dir, "conversations.md")

    stage_name = {
        1: "background-search",
        2: "direction-judgment",
        3: "deep-analysis",
        4: "deep-research",
        5: "final-writing",
    }[step]
    return f"""
## Mandatory Multi-turn Context Rules

Before this step, read the conversation file completely: `{conversations_file}`.

This file is the source of truth for the current turn. It may contain user clarifications, user follow-ups, prior reports, prior intermediate artifact paths, and the latest requirement. You must follow these rules:

- Treat the latest user requirement in `conversations.md` as the current-turn task.
- Carry forward still-valid historical constraints, user preferences, scopes, and delivery requirements.
- `final.md` is the primary historical artifact. Every step should read the immediately previous completed turn's `final.md` when it is listed and readable.
- Prefer the immediately previous completed turn. If there are many turns, such as 20 turns, start from turn 19 when working on turn 20. Use older turns only when the current query explicitly depends on them, the previous turn is insufficient, or the user asks for cross-turn correction or synthesis.
- Read relevant prior artifact paths listed in the file; when a listed path exists and matters to this turn, use it to decide what can be reused, verified, or redone.
- For artifacts other than `final.md`, read only the files relevant to this step. For example, background-search should usually read the previous `background.md` plus the previous `final.md`, then reuse still-valid background and add only what the current query needs.
- You may copy, compress, or lightly adapt still-valid prior content, but you must not use an old file path as this turn's output.
- Treat only literal user input, assistant reports, and artifact paths as context. Ignore owner-agent thoughts, assumptions, inferred preferences, style proposals, or research plans if they appear in `conversations.md`.
- Do not skip this step. Even if history is sufficient, this step must produce a new current-turn {stage_name} artifact at the current target file.
- Do not ask the user for clarification, do not wait for more input, and do not send the task back to the main agent. Unless the task is truly impossible, execute the step directly.
- Do not mention `conversations.md`, the "Mandatory Multi-turn Context Rules", the multi-turn mechanism, prior-turn file paths, or any internal workspace path inside the target file you produce for this step. The writing step will eventually surface artifacts to the user, and these internal references must not leak through. Internal reasoning, tool calls, and notes outside the target file may reference them as needed.
""".rstrip()


def build_values(workspace_dir: Path, step: int, current_date: str) -> dict[str, str]:
    target_filename = STEP_OUTPUT_FILES[step]
    return {
        "current_date": current_date,
        "workspace_dir": str(workspace_dir),
        "research_dir": str(workspace_dir / "research"),
        "raw_query_file": str(workspace_dir / "raw_query.txt"),
        "background_file": str(workspace_dir / "background.md"),
        "judgment_file": str(workspace_dir / "judgment.md"),
        "analysis_file": str(workspace_dir / "analysis.md"),
        "research_plan_file": str(workspace_dir / "research_plan.md"),
        "document_file": str(workspace_dir / "document.md"),
        "conversations_file": str(workspace_dir / "conversations.md"),
        "conversation_context_block": conversation_context_block(workspace_dir, step),
        "target_filename": target_filename,
        "target_file": str(workspace_dir / target_filename),
    }


def yaml_quote(value: str) -> str:
    """Quote a scalar as a YAML double-quoted string."""
    return json.dumps(value, ensure_ascii=False)


def yaml_block_literal(value: str, indent: int) -> str:
    """Render a multi-line string as a YAML block literal `|`.

    Preserves newlines exactly. Trailing newlines are stripped because the
    block scalar always re-adds one.
    """
    pad = " " * indent
    body_lines = value.rstrip("\n").splitlines() or [""]
    body = "\n".join(f"{pad}{line}" if line else pad.rstrip() for line in body_lines)
    return "|\n" + body


def build_step3_post_hook_prompt(workspace_dir: Path, current_date: str) -> str:
    """Step 3 producer prompt appendix that materializes research_plan.md.

    Step 4 / Step 5 prompts reference research_plan.md but it's a mechanical
    concatenation of judgment.md + analysis.md, not an LLM artifact. We append
    a deterministic write instruction to the Step 3 prompt so the producer
    creates it before Step 4 starts.
    """
    research_plan = workspace_dir / "research_plan.md"
    judgment = workspace_dir / "judgment.md"
    analysis = workspace_dir / "analysis.md"
    return (
        "\n\n---\n\n"
        "## After writing analysis.md\n\n"
        "Once `analysis.md` is fully written, also create "
        f"`{research_plan}` by mechanically concatenating "
        f"`{judgment}` and `{analysis}` with this exact structure:\n\n"
        "```markdown\n"
        "## Direction Judgment\n\n"
        "<contents of judgment.md, trimmed of trailing whitespace>\n\n"
        "---\n\n"
        "## Detailed Analysis\n\n"
        "<contents of analysis.md, trimmed of trailing whitespace>\n"
        "```\n\n"
        "Do not summarize, paraphrase, translate, or reformat the two source "
        "files. Read both files in full and concatenate them as-is. This file "
        "is required input for Step 4."
    )


def build_plan_yaml(
    *,
    skill_dir: Path,
    workspace_dir: Path,
    current_date: str,
    plan_name: str,
    assigned_to: str,
) -> str:
    lines: list[str] = []
    lines.append("version: 1")
    lines.append("plan:")
    lines.append(f"  name: {yaml_quote(plan_name)}")
    lines.append("  # 1: deep-research is a file-input pipeline where each step reads the")
    lines.append("  # previous step's output; concurrency would only introduce read/write")
    lines.append("  # races on the canonical files (background.md, judgment.md, ...).")
    lines.append("  max_concurrency: 1")
    lines.append("  # 3 consecutive failures stop the plan. A single task retrying forever")
    lines.append("  # burns budget without producing a better file; cut the run after 3.")
    lines.append("  max_consecutive_failures: 3")
    lines.append("  # 5 steps x 1 retry = 5 success-path cycles. 10 gives ~2x headroom for")
    lines.append("  # one or two retries across the pipeline before the cap kicks in.")
    lines.append("  max_cycles: 10")
    lines.append("  # No per-step verifiers (verify_skip_reason below), so the engine has")
    lines.append("  # no one to wait on. auto-accept lets the next step start immediately.")
    lines.append("  auto_accept: true")
    lines.append("  # No verifier -> no reject path. Pin to 0 explicitly so a future")
    lines.append("  # 'harmonize with the verifier-using plans' change can't accidentally")
    lines.append("  # turn this into a retry loop.")
    lines.append("  auto_reject_retries: 0")
    lines.append("tasks:")

    for step in (1, 2, 3, 4, 5):
        values = build_values(workspace_dir, step, current_date)
        prompt = render_step_prompt(skill_dir, step, values)
        if step == 3:
            prompt = prompt.rstrip("\n") + build_step3_post_hook_prompt(workspace_dir, current_date)

        task_id = f"step-{step}-{STEP_TEMPLATE_FILES[step].split('_', 1)[1].rsplit('.', 1)[0]}"

        lines.append(f"  - id: {task_id}")
        lines.append(f"    title: {yaml_quote(STEP_TITLES[step])}")
        lines.append(f"    assigned_to: {yaml_quote(assigned_to)}")
        lines.append("    role: produce")
        lines.append(f"    verify_skip_reason: {yaml_quote(VERIFY_SKIP_REASON)}")
        lines.append("    depends_on: []")
        lines.append("    # 1 retry covers transient LLM/IO flakes (rate limit, network blip).")
        lines.append("    # More retries on a research step just multiply the chance of an")
        lines.append("    # LLM writing inconsistent data into the canonical file.")
        lines.append("    max_retries: 1")
        lines.append("    prompt: " + yaml_block_literal(prompt, indent=6))

    return "\n".join(lines) + "\n"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--skill-dir", required=True, type=Path)
    parser.add_argument("--workspace-dir", required=True, type=Path)
    parser.add_argument("--current-date", required=True, help="Human-readable date, e.g. 'May 29, 2026'")
    parser.add_argument("--plan-name", required=True)
    parser.add_argument("--assigned-to", default="general", help="Agent name for every producer task")
    parser.add_argument("--output", required=True, type=Path)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not args.skill_dir.is_dir():
        die(f"skill directory does not exist: {args.skill_dir}")
    if not args.workspace_dir.is_dir():
        die(f"workspace directory does not exist: {args.workspace_dir}")
    raw_query = args.workspace_dir / "raw_query.txt"
    if not raw_query.exists() or not raw_query.read_text(encoding="utf-8").strip():
        die(f"workspace must contain non-empty raw_query.txt before rendering: {raw_query}")

    yaml_text = build_plan_yaml(
        skill_dir=args.skill_dir,
        workspace_dir=args.workspace_dir,
        current_date=args.current_date,
        plan_name=args.plan_name,
        assigned_to=args.assigned_to,
    )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    tmp = args.output.with_name(f".{args.output.name}.tmp.{os.getpid()}")
    try:
        tmp.write_text(yaml_text, encoding="utf-8")
        tmp.replace(args.output)
    finally:
        if tmp.exists():
            tmp.unlink()

    print(f"Rendered Deep Research plan: {args.output}")
    print(f"Bytes: {len(yaml_text.encode('utf-8'))}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
