# Substrate Enforcement Sufficiency Gate Mechanics

This document provides the Atlas-level mechanics for executing the Substrate Enforcement Sufficiency Gate during Ticket Intake.

If the ticket prescribes adding new rules, templates, or instructions to the Agent OS (e.g., `.agents/skills/`, `AGENTS.md`, `AGENTS_ATLAS`, harness docs, workflow templates, or CI guardrails), you MUST explicitly audit existing enforcement layers.

## 1. Enforcement Layer Audit
You MUST verify that the target failure mode is not already prevented by:
- **Layer 4 (CI) Checks:** Static analysis, linting, tests.
- **Layer 1 (AGENTS.md) Invariants:** Core rules and behaviors.
- **Existing Skill Logic:** Existing instructions in the relevant `SKILL.md` or `references/` payloads.

## 2. ROI Evaluation
If the ticket does not explicitly prove that existing enforcement is insufficient, the proposed change is considered **substrate bloat**.
Substrate bloat automatically yields a **Negative ROI**. The ticket must be rejected according to the Rejection Protocol.
