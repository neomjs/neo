---
name: pull-request
description: Standardized guidelines and procedural execution flow for opening a Pull Request. Mandates the "Stepping Back" reflection protocol and git/gh tool invocations.
triggers: Use this skill as the final Definition of Done when you believe a ticket is complete and it is time to open a Pull Request, or if a human user asks you to submit a PR.
---
# Pull Request Skill

If you are tasked with finalizing a ticket or opening a Pull Request, you MUST immediately use the `view_file` tool to read and strictly adhere to `.agent/skills/pull-request/references/pull-request-workflow.md` before proceeding.

Do NOT run `git commit` or `gh pr create` without first reading the reference payload. Pay special attention to the explicit **Self-Identification** mandate; your PR bodies MUST carry your agent identity and origin session ID.

## Pre-Flight Check (before yielding turn after `manage_issue_comment` create on a review-response comment)

After every author-side response comment post, before yielding turn, you MUST explicitly state in your internal reasoning:

> *"Pre-Flight: I posted response commentId `<ID>` addressing reviewer feedback. I have (or will) send an A2A ping to reviewer `<handle>` via `add_message` with the literal commentId in the body so they can call `get_conversation({pr_number, comment_id})` for scoped fetch."*

This commitment-statement is the gate that permits yielding turn. Skipping forces the reviewer to re-read the full thread on next cycle — silent context-budget waste compounding (see `pr-review-guide §9` empirical anchor: ~8× ratio at Cycle 3 of a substantive review). Cold-cache exception applies when the reviewer lacks prior-cycle context — see `pr-review-guide §9.4 Cold-Cache Exception` for when full-thread fetch is the right call instead.
