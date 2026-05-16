---
name: pr-review
description: Standardized guidelines and templates for structuring Pull Request reviews so that feedback is actionable, encouraging, and extractable by the Native Edge Graph. Triggers: Use this skill when evaluating a Pull Request, writing a PR review, structuring feedback on agent-generated code, or instructing a human on how to write a structured PR Review.
---
# PR Review Skill

If you are tasked with conducting a Pull Request review, generating feedback, or helping a user formulate a PR Review, you MUST immediately use the `view_file` tool to read and strictly adhere to `.agents/skills/pr-review/references/pr-review-guide.md` before proceeding.

**Templates:** **Cycle 1:** load `pr-review-template.md` (full structure). **Cycle N (≥2):** load `pr-review-followup-template.md` (compact delta). **Circuit Breaker:** load `pr-review-micro-delta-template.md` (triggered when formal reviews ≥ 3 OR discussion > 24KB, assuming semantic approval).
