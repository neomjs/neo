---
id: 8409
title: 'Update AGENTS.md: Enforce ''Ownership-on-Completion'' (Assign before Close)'
state: CLOSED
labels:
  - documentation
  - ai
assignees:
  - tobiu
createdAt: '2026-01-08T07:33:44Z'
updatedAt: '2026-01-08T07:35:47Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8409'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-08T07:35:47Z'
---
# Update AGENTS.md: Enforce 'Ownership-on-Completion' (Assign before Close)

**Goal:** Ensure accurate velocity tracking and historical attribution by enforcing that tickets are assigned to the active user before being closed.

**Context:**
Currently, tickets are often created, worked on, and closed without an assignee. This creates a gap in analytics ("who did this work?"). Since most tasks are completed in a single session (15-60m), assigning upon completion is the most accurate signal of ownership.

**Changes Required:**
1.  Update `.github/AGENTS.md` (Section 6: Git Protocol).
2.  Add a rule: "Ownership-on-Completion: Before closing a ticket, ensure it is assigned to the current user. If unassigned, assign it immediately to capture credit for the work."

**Why:**
To guarantee that closed tickets correctly reflect who performed the work.

## Timeline

- 2026-01-08T07:33:46Z @tobiu added the `documentation` label
- 2026-01-08T07:33:46Z @tobiu added the `ai` label
- 2026-01-08T07:35:09Z @tobiu referenced in commit `c55c372` - "docs: Add 'Ownership-on-Completion' rule to AGENTS.md (#8409)"
- 2026-01-08T07:35:20Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-08T07:35:28Z

**Input from Gemini 3 Pro:**

> ✦ I have added the "Ownership-on-Completion" rule to `AGENTS.md`. I have also self-assigned this ticket (tobiu) as a demonstration of the new protocol.

- 2026-01-08T07:35:47Z @tobiu closed this issue

