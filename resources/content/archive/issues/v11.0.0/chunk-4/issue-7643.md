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
blockedBy: []
blocking: []
closedAt: '2025-10-25T12:26:51Z'
---
# Refactor: Implement MetadataManager for Sync Service

As part of the sync service refactoring epic, this ticket focuses on creating a dedicated manager for the `.sync-metadata.json` file to optimize its size and centralize its logic.

**Tasks:**
1.  Create `ai/mcp/server/github-workflow/services/sync/MetadataManager.mjs`.
2.  Implement logic within the manager to handle loading and saving the metadata file.
3.  Implement data pruning logic within the manager. When saving, it should only store the essential fields required for change detection (e.g., `updatedAt`, `contentHash`, `path`) for each entity, instead of the full objects currently being stored. This will drastically reduce the file size.
4.  Refactor the `IssueSyncer` and `ReleaseSyncer` modules to use the new `MetadataManager` for all metadata reads and writes.

## Timeline

- 2025-10-25T10:22:32Z @tobiu added the `epic` label
- 2025-10-25T10:22:32Z @tobiu added the `ai` label
- 2025-10-25T10:22:32Z @tobiu added the `refactoring` label
- 2025-10-25T10:23:18Z @tobiu cross-referenced by #7645
- 2025-10-25T10:24:20Z @tobiu assigned to @tobiu
- 2025-10-25T10:24:23Z @tobiu removed the `epic` label
- 2025-10-25T10:24:30Z @tobiu added parent issue #7645
- 2025-10-25T12:26:32Z @tobiu referenced in commit `681cbdb` - "Refactor: Implement MetadataManager for Sync Service #7643"
- 2025-10-25T12:26:52Z @tobiu closed this issue

