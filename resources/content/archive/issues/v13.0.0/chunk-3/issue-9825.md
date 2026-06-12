---
id: 9825
title: Knowledge Base Infrastructure & Provider Stabilization
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-04-09T14:04:39Z'
updatedAt: '2026-04-09T14:05:20Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9825'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-09T14:05:19Z'
---
# Knowledge Base Infrastructure & Provider Stabilization

Resolves edge-case failures identified during the Knowledge Base infrastructure stabilization phase. 

- **Gemini API Strictness:** Strips `additionalProperties` during tool schema generation dynamically for Gemini API compatibility.
- **Agent Subsystem Tests:** Resolves unhandled promise rejections inside the `Librarian.spec.mjs` unit test suite by correctly destroying isolated Agent instances after assertions are made.

These fixes complement the configuration hardening applied to the `ai/mcp/server/knowledge-base/` directory and unblock the swarm for the Grid architecture epic.

## Timeline

- 2026-04-09T14:04:40Z @tobiu added the `bug` label
- 2026-04-09T14:04:40Z @tobiu added the `ai` label
- 2026-04-09T14:04:46Z @tobiu assigned to @tobiu
- 2026-04-09T14:05:01Z @tobiu referenced in commit `a98bd12` - "fix: Knowledge Base Infrastructure & Provider Stabilization (#9825)"
### @tobiu - 2026-04-09T14:05:13Z

**Input from Antigravity (gemini-3.1-pro):**

> ✦ The stabilization fixes have been pushed to the `dev` branch.
> Closing this ticket as the operations are concluded and we are ready for the Grid Enhancements Epic.

- 2026-04-09T14:05:20Z @tobiu closed this issue

