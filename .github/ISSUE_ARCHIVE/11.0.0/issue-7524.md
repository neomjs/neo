---
id: 7524
title: Remove Legacy Express Server from Memory Core
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-17T11:26:42Z'
updatedAt: '2025-10-17T12:36:26Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7524'
author: tobiu
commentsCount: 0
parentIssue: 7520
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-17T12:36:26Z'
---
# Remove Legacy Express Server from Memory Core

**Reported by:** @tobiu on 2025-10-17

---

**Parent Issue:** #7520 - Epic: Migrate Memory Server to stdio-based MCP

---

With the new `stdio`-based MCP server fully functional, the final step is to remove the legacy Express.js implementation to complete the migration.

## Acceptance Criteria

1.  The `index.mjs` file (the Express server entry point) is deleted from `ai/mcp/server/memory-core/`.
2.  Any direct Express.js dependencies (`express`, `cors`, etc.) are removed from the main `package.json` if they are no longer needed by other parts of the project.
3.  The `start` script for the memory server in `package.json` is updated or removed.

