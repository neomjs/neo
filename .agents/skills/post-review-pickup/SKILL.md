---
name: post-review-pickup
description: "Authoritative protocol for next-lane pickup after PR review / author response handoff AND for pre-review intake lane discovery from fresh boot or watchdog wake when no author lane is active. Prevents silent idle and reviewer-only cycles by requiring the next lane, a review-first rationale, or an explicit halt-state. Triggers: Use immediately after posting a PR review, chaining a formal GitHub review state, posting an author review-response handoff with a commentId, OR before accepting the first PR review/re-review request in a fresh session/wake when no current author or implementation lane is claimed."
---

# Post-Review Pickup Skill

If you just completed a PR review / review-response handoff, OR if you are
about to accept the first review request in a fresh session or watchdog wake
while no author lane is active, you MUST immediately use the `view_file` tool
to read and strictly adhere to `.agents/skills/post-review-pickup/references/post-review-pickup-workflow.md` before proceeding or ending the turn.
