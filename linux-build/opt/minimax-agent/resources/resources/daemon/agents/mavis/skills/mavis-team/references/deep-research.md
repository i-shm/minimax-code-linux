# Deep Research Team Guidance

This reference is loaded when a Team task involves deep research — multi-source investigation,
evidence synthesis, and verified deliverables. It covers source strategy, fact verification,
and plan patterns.

> ⚠️ YAML strings shown here are English templates and must be translated into the user's language
> before submitting (mavis-team SKILL.md "Hard rule"). `timeout_ms` is omitted in examples
> (defaults to 30-min cap).

## Research preflight

Expands SKILL.md's readiness questions for research. Skip if context is already sufficient.

- **Pin the unknowns** — turn vague topics into concrete researchable questions
- **Scope 2–4 parallel angles** — independent enough to assign to separate workers
- **Check source availability** — which sources (web, docs, CLI/MCP, databases) apply?
- **Define deliverable shape** — format, depth, audience
- **Set a depth contract** — `brief` / `standard-report` / `deep-report` /
  `deep-engineering-handbook`, expected scale, required appendices, and what "too shallow" means
  for this task

Stop here. Comparing sources or writing conclusions is Team work, not preflight.

## Deep Research Deliverable Contract

For any high-cost research plan (3+ tracks, >20 minutes expected runtime, security/architecture
audit, regulatory/financial analysis, or user explicitly asks for deep research), the plan owner
MUST put a contract like this into the synthesis/final-report task prompt. Treat it as an
acceptance spec, not decoration.

```yaml
depth_level: deep-engineering-handbook # brief | standard-report | deep-report | deep-engineering-handbook
expected_scale:
  main_report: '<e.g. dense multi-section report; do not collapse into overview>'
  appendices: '<raw evidence inventory / source matrix required or explicitly N/A>'
must_include:
  - coverage matrix mapping each upstream research track to final sections
  - per-topic or per-module deep dives at the granularity needed by the audience
  - evidence chain for every risk/conclusion: evidence, trigger/condition, impact, confidence, verification path
  - contradictions / uncertainty / open questions, not silently resolved away
  - source index with file_path:line_number, URL/date, dataset name, or system query as appropriate
compression_policy:
  - executive summary is allowed, but it must not replace the full body
  - preserve important upstream findings in the body or appendices; do not discard them because the summary is clean
verification:
  - factual correctness against original sources
  - completeness against all verified upstream deliverables
  - depth adequacy against user request, risk level, and elapsed team effort
```

Do NOT use fake line-count targets as a substitute for content quality. A long padded report is not
deep. But a deep research run that consumed multiple verified deliverables and returns only a tidy
overview is a failure unless the user explicitly asked for a summary.

### Depth levels

Use these labels to make expectations concrete:

| Level | Use when | Minimum expectation |
|---|---|---|
| `brief` | User needs a quick answer or decision memo | Concise answer, key evidence, known gaps. |
| `standard-report` | Normal multi-source research | Structured synthesis, source list, major trade-offs and risks. |
| `deep-report` | High-stakes or broad research | Full evidence chains, coverage matrix, contradictions, appendices. |
| `deep-engineering-handbook` | Codebase/system research meant to guide implementation or maintenance | Module-by-module analysis, entrypoints, data structures, call chains, boundary behavior, failure modes, tests, risk remediation paths. |

When unsure, choose the deeper level if the team plan is expensive or the user is waiting for a
formal research result. You can always include a short executive summary on top of a deep body.

## Task splitting for research

For high-stakes or multi-source research, keep verified research/synthesis gates before
production deliverables. Don't combine research and production in one task when the research
needs independent verification. For lightweight research that feeds directly into a small
deliverable (e.g. quick lookup then draft an email), combining is fine.

## Source strategy

When writing task prompts, **specify which sources to check** — don't assume the worker will
figure it out. Sources include web, local files, Lark docs/Bitable, chat/email/meeting notes,
CLI/MCP tools, and business systems. Be explicit.

## Research-specific verification

Beyond the general verification policy in the main skill, research verifiers should focus on:

- **Source independence** — go back to original sources, not re-read the producer's summary
- **Currency** — data, prices, features, and regulatory info must be current
- **Attribution** — every factual claim traces to a specific source (URL, doc name, date, section)
- **Cherry-picking** — synthesis must fairly represent full evidence, not just favorable parts
- **Calculations** — re-derive any numbers, percentages, or rankings from source data
- **Completeness against upstream work** — check that the synthesis consumed every verified research
  track and did not drop important findings during compression
- **Depth adequacy** — judge whether the deliverable meets the explicit depth contract and is
  proportional to the user's request, risk level, and elapsed team effort
- **Evidence retention** — verify that raw evidence/source matrices remain available in the body or
  appendices when the contract requires them

For deep reports, write the final-report `verified_by` as either multiple distinct verifiers when
available (for example factual verifier + domain/code reviewer) or a single verifier prompt with two
separate sections:

1. factual correctness: source accuracy, unsupported claims, stale data, calculations
2. depth/completeness: coverage matrix, upstream-findings consumption, evidence-chain completeness,
   no overview-only compression

The final report should FAIL verification if it is merely correct but too thin for the contract.

## Plan patterns for research

Use these as routing patterns, not copy-paste YAML. The final plan should be written from the
actual research questions, sources, and deliverable contract.

### Pattern: parallel investigation tracks + synthesis gate

The most common research pattern. Each track investigates an independent angle, then a synthesis
task cross-references all findings.

```
[track-A: market analysis]    --\
[track-B: tech evaluation]    ---+-> [synthesis: cross-reference and recommend]
[track-C: regulatory review]  --/
```

Key rules:
- Each track should have its own verifier pass before synthesis
- The synthesis task should explicitly cross-reference, not just concatenate
- The synthesis prompt should include a Deep Research Deliverable Contract when the task is high-cost
- The synthesis verifier should check that every conclusion traces to evidence and that the final
  report is deep enough for the contract
- When the synthesis task produces a report, follow `references/report.md` for structure,
  citation format, and quality signals

The schema-relevant piece is the synthesis gate — independent tracks have no `depends_on`, the
synthesis task lists all of them and embeds the deliverable contract in its prompt:

```yaml
tasks:
  # ...parallel tracks, each: assigned_to: general, verified_by: verifier,
  #    verify_prompt requires source attribution + currency check...

  - id: report
    title: 'synthesize final competitive analysis report'
    prompt: |
      <cross-reference all tracks, identify opportunities/risks, write structured report.
       Include the depth contract: deep-report, coverage matrix, per-risk evidence chains,
       appendices/source index, no overview-only compression.>
    assigned_to: general
    depends_on: [market-position, tech-capabilities, ecosystem-trends]   # gate after all tracks
    verified_by: verifier
    verify_prompt: |
      <verify every recommendation traces to evidence from tracks (no unsupported claims);
       separately verify completeness/depth against contract, all upstream deliverables
       consumed, no over-compression>
```

### Pattern: breadth scan + deep dive

First, a broad scan identifies the most promising areas, then targeted deep dives follow.

```
[broad-scan] --> [deep-dive-A] --\
                 [deep-dive-B] ---+-> [synthesis]
                 [deep-dive-C] --/
```

Use this when the research space is too large to investigate everything in parallel. The broad
scan task should explicitly output which areas deserve deep dives.

### Pattern: multi-source fact verification

When accuracy is critical (financial, legal, regulatory, medical, safety), have multiple
workers independently verify the same claims from different sources.

```
[primary-research]  --> [independent-verification] --> [reconciliation]
```

### Pattern: research + action

When research leads directly to system changes, documents, or communications.

```
[research-tracks]  --> [synthesis]  --> [produce-deliverable]
```

The deliverable task (create report, update spreadsheet, draft email, generate deck) should
depend on completed and verified research. Don't combine research and production in one task.
When the deliverable is a report, reference `references/report.md` in the task prompt for
writing principles and format guidance.
