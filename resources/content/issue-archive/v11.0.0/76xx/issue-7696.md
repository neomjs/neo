---
id: 7696
title: Update AI_QUICK_START.md for new MCP server architecture
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-11-03T10:13:54Z'
updatedAt: '2025-11-03T11:13:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7696'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-03T11:13:16Z'
---
# Update AI_QUICK_START.md for new MCP server architecture

The `AI_QUICK_START.md` guide needs to be updated to reflect the current MCP server architecture. Specifically:

- Content from section 3.3 onwards is outdated.
- Users no longer need to manually build the knowledge base; the MCP server handles this automatically on startup.
- The memory core is now automatically used if the MCP server is healthy, so explicit instructions for its use are no longer needed.
- `npm run ai:server` and `npm run ai:server-memory` are now optional, primarily for debugging purposes, as the servers will start ChromaDB instances on their own.
- The initial handshake instruction to "follow the instructions inside agents.md" is obsolete, as this process is now automated via `@.gemini/GEMINI.md`.

This update will simplify the setup process for developers.

## Timeline

- 2025-11-03T10:13:55Z @tobiu added the `enhancement` label
- 2025-11-03T10:13:55Z @tobiu added the `ai` label
- 2025-11-03T10:15:10Z @tobiu assigned to @tobiu
- 2025-11-03T10:15:18Z @tobiu added the `documentation` label
- 2025-11-03T10:45:50Z @tobiu referenced in commit `c85e78e` - "Update AI_QUICK_START.md for new MCP server architecture #7696"
- 2025-11-03T11:12:57Z @tobiu referenced in commit `51a4dc4` - "#7696 more polishing"
- 2025-11-03T11:13:16Z @tobiu closed this issue

