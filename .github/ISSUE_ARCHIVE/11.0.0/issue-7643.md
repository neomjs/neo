---
id: 7643
title: 'Refactor: Implement MetadataManager for Sync Service'
state: CLOSED
labels:
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-10-25T10:22:30Z'
updatedAt: '2025-10-25T12:26:51Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7643'
author: tobiu
commentsCount: 0
parentIssue: 7645
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-25T12:26:51Z'
---
# Refactor: Implement MetadataManager for Sync Service

**Reported by:** @tobiu on 2025-10-25

---

**Parent Issue:** #7645 - Epic: Refactor and Extend GitHub Sync Service

---

As part of the sync service refactoring epic, this ticket focuses on creating a dedicated manager for the `.sync-metadata.json` file to optimize its size and centralize its logic.

**Tasks:**
1.  Create `ai/mcp/server/github-workflow/services/sync/MetadataManager.mjs`.
2.  Implement logic within the manager to handle loading and saving the metadata file.
3.  Implement data pruning logic within the manager. When saving, it should only store the essential fields required for change detection (e.g., `updatedAt`, `contentHash`, `path`) for each entity, instead of the full objects currently being stored. This will drastically reduce the file size.
4.  Refactor the `IssueSyncer` and `ReleaseSyncer` modules to use the new `MetadataManager` for all metadata reads and writes.

