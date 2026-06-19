---
name: post-review-pickup
description: "Authoritative protocol for next-lane pickup after ANY PR-lifecycle event boundary (review post, author response, implementation completion, PR open/update, ticket create, blocked-state resolution) AND for pre-review intake lane discovery from fresh boot or watchdog wake when no author lane is active. Prevents silent idle and reviewer-only cycles by requiring active lane selection or a review-first rationale per §15.6 self-select mandate. Triggers: Use immediately after posting a PR review, chaining a formal GitHub review state, sending an author review-response commentId handoff, completing a discrete implementation chunk, opening/updating a PR, creating a ticket via create_issue, resolving a previously blocked state (positive-path exit only; new blockers route to bug/follow-up plus next lane), OR before accepting the first PR review/re-review request in a fresh session/wake when no current author or implementation lane is claimed."
---

# Post-Review Pickup Skill

If you just completed ANY lifecycle event that closes a discrete unit of work — PR review, author response handoff, implementation completion, PR open/update, ticket create, or blocked-state resolution — OR if you are about to accept the first review request in a fresh session or watchdog wake while no author lane is active, you MUST immediately use the `view_file` tool to read and strictly adhere to `.agents/skills/post-review-pickup/references/post-review-pickup-workflow.md` before proceeding or ending the turn.
