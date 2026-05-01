---
name: pr-review
description: Standardized guidelines and templates for structuring Pull Request reviews so that feedback is actionable, encouraging, and extractable by the Native Edge Graph.
triggers: Use this skill when evaluating a Pull Request, writing a PR review, structuring feedback on agent-generated code, or instructing a human on how to write a structured PR Review.
---
# PR Review Skill

If you are tasked with conducting a Pull Request review, generating feedback, or helping a user formulate a PR Review, you MUST immediately use the `view_file` tool to read and strictly adhere to `.agents/skills/pr-review/references/pr-review-guide.md` before proceeding.

**Cycle 1 (new review):** load `.agents/skills/pr-review/assets/pr-review-template.md` and apply its full sectioned structure verbatim. The template's emoji-headered sections are regex-matched by the Retrospective daemon for graph ingestion; structure is load-bearing.

**Cycle N (re-review, N≥2):** load `.agents/skills/pr-review/assets/pr-review-followup-template.md` instead. Compact delta-only shape: Prior Review Anchor → Delta Scope → Previous Required Actions Audit → Delta Depth Floor → Metrics Delta (only changed scores) → A2A Hand-off. Re-running the full Cycle 1 template on follow-up cycles generates noisy graph data and wastes review budget.
