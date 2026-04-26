---
name: pr-review
description: Standardized guidelines and templates for structuring Pull Request reviews so that feedback is actionable, encouraging, and extractable by the Native Edge Graph.
triggers: Use this skill when evaluating a Pull Request, writing a PR review, structuring feedback on agent-generated code, or instructing a human on how to write a structured PR Review.
---
# PR Review Skill

If you are tasked with conducting a Pull Request review, generating feedback, or helping a user formulate a PR Review, you MUST immediately use the `view_file` tool to read and strictly adhere to `.agent/skills/pr-review/references/pr-review-guide.md` before proceeding.

## Pre-Flight Check (before yielding turn after `manage_issue_comment` create)

After every review-comment post, before yielding turn, you MUST explicitly state in your internal reasoning:

> *"Pre-Flight: I posted review commentId `<ID>` for cycle K. I have (or will) send an A2A ping to `<recipient>` via `add_message` with the literal commentId in the body so they can call `get_conversation({pr_number, comment_id})` for scoped fetch."*

This commitment-statement is the gate that permits yielding turn. Skipping forces the next cycle's actor to re-read the full thread — silent context-budget waste compounding per cycle (see guide §9 empirical anchor: ~8× ratio at Cycle 3 of a substantive review). Cold-cache exception applies when the recipient lacks prior-cycle context — see guide **§9.4 Cold-Cache Exception** for when full-thread fetch is the right call instead.
