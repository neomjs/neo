---
id: 7642
title: 'Refactor: Extract Release & Issue Syncers from SyncService'
state: CLOSED
labels:
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-10-25T10:21:43Z'
updatedAt: '2025-10-25T11:40:45Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7642'
author: tobiu
commentsCount: 0
parentIssue: 7645
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-25T11:40:45Z'
---
# Refactor: Extract Release & Issue Syncers from SyncService

**Reported by:** @tobiu on 2025-10-25

---

**Parent Issue:** #7645 - Epic: Refactor and Extend GitHub Sync Service

---

As the first step in the larger sync service refactoring (Epic: Refactor and Extend GitHub Sync Service), this ticket focuses on breaking down the monolithic `SyncService` into smaller, more focused modules.

**Tasks:**
1.  Create a new directory: `ai/mcp/server/github-workflow/services/sync/`.
2.  Create `sync/ReleaseSyncer.mjs` and move all release-related fetching and file-writing logic into it from `SyncService`.
3.  Create `sync/IssueSyncer.mjs` and move all issue-related pull, push, and formatting logic into it from `SyncService`.
4.  Refactor `SyncService.mjs` to become a lean orchestrator that imports and calls the new `ReleaseSyncer` and `IssueSyncer` modules.
5.  Update comments and method names within `SyncService` to be more generic and accurate.

