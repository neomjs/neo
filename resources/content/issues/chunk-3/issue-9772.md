---
id: 9772
title: Strengthen Anti-Slop / Quality Pre-Commit Gate in Agent Operational Mandates
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-04-07T22:29:42Z'
updatedAt: '2026-04-07T22:30:01Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9772'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-07T22:30:01Z'
---
# Strengthen Anti-Slop / Quality Pre-Commit Gate in Agent Operational Mandates

### Problem
Currently, the operational rules prioritize the "Ticket-before-Commit" gate as an absolute hard stop. The "Anchor & Echo" Knowledge Base strategy is technically also a gate but doesn't share the same critical warning footprint, leading to instances where AI agents might write code fast (and get the ticket right) but commit it without documentation—potentially exposing the codebase to "AI slop". 

### Goal
We must harden the Agent Pre-Flight checks so that the code quality standard (specifically 100% semantic JSDoc & the Anchor/Echo strategy) is treated organically as the **second half of a single, non-negotiable Pre-Commit Hard Gate**.

### Execution
1.  Target `AGENTS.md` and upgrade the "Ticket-Before-Commit" section into **"The Pre-Commit Hard Gates (Tickets & Anti-Slop)"**. 
2.  Define **Gate 1 (Tickets)** and **Gate 2 (Anti-Slop)** directly next to each other.
3.  Target `AGENTS_STARTUP.md` and boldly establish the Knowledge Base Enhancement section as a **"Mandatory Anti-Slop Gate"**, making it strictly forbidden to commit undocumented logic.

## Timeline

- 2026-04-07T22:29:43Z @tobiu added the `documentation` label
- 2026-04-07T22:29:43Z @tobiu added the `enhancement` label
- 2026-04-07T22:29:43Z @tobiu added the `ai` label
- 2026-04-07T22:29:50Z @tobiu referenced in commit `1c4030e` - "docs(ai): elevated knowledge base strategy to be a mandatory pre-commit anti-slop gate (#9772)

- Restructured AGENTS.md to define Gate 1 (Tickets) and Gate 2 (Anti-Slop Quality/Docs) as the two unified Pre-Commit Hard Gates.
- Annotated AGENTS_STARTUP.md to declare that committing undocumented/unanchored code is strictly forbidden."
- 2026-04-07T22:29:58Z @tobiu assigned to @tobiu
- 2026-04-07T22:30:01Z @tobiu closed this issue

