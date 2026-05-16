---
name: post-review-pickup
description: Authoritative protocol for immediate next-phase pickup after PR review or author response handoff. Prevents silent idle after review cycles by requiring the next lane or an explicit halt-state. Triggers: Use immediately after posting a PR review, chaining a formal GitHub review state, or posting an author review-response handoff with a commentId.
---

# Post-Review Pickup Skill

If you just completed a PR review or review-response handoff, you MUST immediately use the `view_file` tool to read and strictly adhere to `.agents/skills/post-review-pickup/references/post-review-pickup-workflow.md` before ending the turn.
