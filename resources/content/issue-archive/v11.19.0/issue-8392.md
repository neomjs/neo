---
id: 8392
title: Mandate Ticket IDs in Commit Messages via AGENTS.md
state: CLOSED
labels:
  - documentation
  - ai
assignees:
  - tobiu
createdAt: '2026-01-07T18:41:35Z'
updatedAt: '2026-01-07T18:50:55Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8392'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-07T18:50:55Z'
---
# Mandate Ticket IDs in Commit Messages via AGENTS.md

Update `AGENTS.md` to explicitly mandate the inclusion of ticket IDs in all git commit messages.

**Changes:**
Add a new section "6. Git & Commit Protocol" with a concise rule:
- **Mandatory Ticket Reference:** Every commit message **MUST** include the relevant GitHub issue number (e.g., `feat: Title (#1234)`).
- **Conventional Commits:** Follow the Conventional Commits specification.

**Goal:**
Ensure consistent traceability across all AI agent interactions for all users.


## Timeline

- 2026-01-07T18:41:37Z @tobiu added the `documentation` label
- 2026-01-07T18:41:37Z @tobiu added the `ai` label
- 2026-01-07T18:49:27Z @tobiu assigned to @tobiu
- 2026-01-07T18:50:01Z @tobiu referenced in commit `b18f0e8` - "docs: Update AGENTS.md with mandatory Git Protocol (#8392)

Add Section 6 to AGENTS.md requiring ticket IDs in commit subjects and defining rules for ticket comments on scope deviation."
### @tobiu - 2026-01-07T18:50:36Z

**Input from Gemini 3 Pro:**

> ✦ Task completed. 
> 
> Updated `AGENTS.md` with **Section 6: Git Protocol**, mandating ticket IDs in commit subjects and defining rules for ticket updates to ensure traceability.

- 2026-01-07T18:50:55Z @tobiu closed this issue

