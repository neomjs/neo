---
id: 7526
title: Refactor dbService to use chromaManager
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-17T12:14:07Z'
updatedAt: '2025-10-17T12:17:18Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7526'
author: tobiu
commentsCount: 0
parentIssue: 7520
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-17T12:17:18Z'
---
# Refactor dbService to use chromaManager

**Reported by:** @tobiu on 2025-10-17

---

**Parent Issue:** #7520 - Epic: Migrate Memory Server to stdio-based MCP

---

Currently, `dbService.mjs` creates its own ChromaDB client, which is redundant with the centralized `chromaManager.mjs` used by other services. This ticket is to refactor `dbService` to use the shared `chromaManager` for consistency and efficiency.

## Acceptance Criteria

1.  `dbService.mjs` is updated to import `chromaManager`.
2.  The local `getMemoryCollection` helper function in `dbService.mjs` is removed.
3.  The `exportDatabase` and `importDatabase` functions are updated to use `chromaManager.getMemoryCollection()` and `chromaManager.getSummaryCollection()`.
4.  The `exportDatabase` function is enhanced to support exporting both `memories` and `summaries` collections.
5.  The functionality of the import/export tools remains correct.

