---
name: pr-review
description: "Standardized guidelines and templates for structuring Pull Request reviews so feedback is actionable, encouraging, and extractable by the Native Edge Graph. MANDATORY ROI WARNING: Skipping the review template guarantees CI lint failure. Triggers: Reviewing a PR (yours or peer's) — structured eval metrics, graph ingestion tags, severity ladder, restates §0 merge gate, post-comment A2A commentId hand-off (reviewer→author) per guide §10, Evidence Audit + Source-of-Authority sections (template §) for substrate/runtime-AC PRs and authority-citation review-comments."
---
# PR Review Skill

If you are tasked with conducting a Pull Request review, generating feedback, or helping a user formulate a PR Review, you MUST immediately use the `view_file` tool to read and strictly adhere to `.agents/skills/pr-review/references/pr-review-guide.md` before proceeding.

**Prior-art sweep gate (PR-review = the last line of defense, per AGENTS.md §verify_before_assert):** before scoring, run a cheap 3–10-call `query_raw_memories` / `query_summaries` sweep of the PR's decision space — a prior session may have settled the shape, an ADR may already govern it, or the same wrong-shape may have been caught before. The sweep RESULT is the V-B-A; CI-green ≠ AC-met (#13354). **Same gate, on your instrument:** if the diff adds a capability gate / flag / new field, or your review is about to claim something is absent, load `references/reviewer-instrument-audit.md` — does satisfying the gate cause an effect or only describe one, does a production writer exist for the field, and does any "no caller" search carry a positive control plus the tree/SHA it ran against.

**Templates:** **Round 1:** load `pr-review-template.md` (full structure). **Round 2:** load `pr-review-round-2-template.md` — disposition only, actions verbatim. **Budget:** ONE ordinary RC per reviewer family; at >24KB load `audits/review-cost-circuit-breaker.md`. Then approve/polish, A+FU, or one terminal D+S—never another ordinary RC.
