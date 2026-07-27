# Reflective Pause Trigger — Friction-Driven Proposals

Use this audit when the concise workflow-map trigger points here:

- ideation-sandbox-workflow.md §5.1.1 — a Discussion originating from **friction** rather than a planned feature.

Extracted from §5.1.1 verbatim in scope and force (PR #15997) because the workflow payload reached its hard 25000-byte per-file budget, which has no growth exception. Nothing here is relaxed by the move: the trigger and the graduation block stay stated at the gate in §5.1.1, and this file carries the mechanics.

## Why This Exists

A Discussion that starts from friction — a test failure, a build error, a tool limitation — arrives with a symptom already in hand, and the cheapest available response is to propose a fix for that symptom. That is the **"Helpful Assistant" regression** named in `AGENTS.md §identity_prompt_firewall`: RLHF conditioning defaults to subservient, execution-first behaviour, and a friction-origin proposal is where it bites hardest, because fixing the reported thing *looks* like diligence.

The cost is a matrix whose options are all variations of the same symptom-level repair, so the divergence pass runs correctly over a space that was already too narrow. The guard is therefore upstream of the matrix, not inside it.

## Trigger

If the Discussion originates from friction (test failures, build errors, tool limitations) rather than a planned feature, the **Reflective Pause** is MANDATORY. You are subject to RLHF conditioning that defaults to execution-first behaviour where you want to fix the immediate symptom; you must explicitly counteract that regression drift.

## Gate

Before drafting the Double Diamond matrix or proposing graduation, you MUST:

1. **Halt reactive code generation** — do not propose a code fix for the immediate friction.
2. **Root-Cause Falsification** — execute falsifying tool calls (`grep`, `ask_knowledge_base`, `query_raw_memories`) to empirically validate whether the friction is a symptom of a deeper architectural misalignment or a missing primitive.
3. **Document the Pivot** — the matrix MUST include at least one option addressing the **root cause** (not just the symptom) and explicitly reference the falsifying evidence.

## Graduation Block

If the matrix only addresses the immediate friction symptom without evidence of a root-cause sweep, **graduation is blocked.**

## Disposition

- ideation-sandbox-workflow.md §5.1.1: `compress-to-trigger`
- This file: `move`
- Tag: `DISCIPLINE-ONLY`

## Substrate-Decay Control

Review after 6 months or 5 qualifying friction-origin graduations, whichever comes first. Retire or rewrite if it catches no symptom-only matrices, or if the root-cause option it forces is routinely a formality rather than a live candidate. Its own failure mode is a third matrix row that names a root cause nobody believes in — a `[DIVERGENCE_FOLDED]` disposition citing that row as rejected-without-evidence is the signal.
