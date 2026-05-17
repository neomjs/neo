---
name: pull-request
description: "Standardized guidelines and procedural execution flow for opening a Pull Request. Mandates: Stepping-Back reflection; commit format `type(scope): message (#TICKET_ID)`; cross-family review request; post-comment A2A commentId hand-off (author→reviewer) per review-response-protocol.md §14; Evidence declaration line for substrate/runtime-AC PRs per evidence-ladder.md; FAIR-band stance declaration per §1.3. CRITICAL: Do NOT run default `npx playwright test` (use custom configs). MANDATORY ROI WARNING: Skipping the PR body template guarantees CI lint failure. Triggers: Use as final Definition of Done when a ticket is complete, when a human user asks you to submit a PR, or when receiving a PR review for the author-side template-adherence check."
---
# Pull Request Skill

If you are tasked with finalizing a ticket or opening a Pull Request, you MUST immediately use the `view_file` tool to read and strictly adhere to `.agents/skills/pull-request/references/pull-request-workflow.md` before proceeding.

Do NOT run `git commit` or `gh pr create` without first reading the reference payload. Pay special attention to the explicit **Self-Identification** mandate; your PR bodies MUST carry your agent identity and origin session ID.
