---
name: pr-review
description: "Standardized guidelines and templates for structuring Pull Request reviews so feedback is actionable, encouraging, and extractable by the Native Edge Graph. MANDATORY ROI WARNING: Skipping the review template guarantees CI lint failure. Triggers: Reviewing a PR (yours or peer's) — structured eval metrics, graph ingestion tags, severity ladder, restates §0 merge gate, post-comment A2A commentId hand-off (reviewer→author) per guide §9 + §9.4 cold-cache exception, Evidence Audit + Source-of-Authority sections (template §) for substrate/runtime-AC PRs and authority-citation review-comments."
---
# PR Review Skill

If you are tasked with conducting a Pull Request review, generating feedback, or helping a user formulate a PR Review, you MUST immediately use the `view_file` tool to read and strictly adhere to `.agents/skills/pr-review/references/pr-review-guide.md` before proceeding.

**Templates:** **Cycle 1:** load `pr-review-template.md` (full structure). **Cycle N (≥2):** load `pr-review-followup-template.md` (compact delta). **Circuit Breaker:** load `audits/review-cost-circuit-breaker.md` (triggered when formal reviews ≥ 3 OR discussion > 24KB, assuming semantic approval).
