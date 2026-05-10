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
blockedBy: []
blocking: []
closedAt: '2025-10-25T11:40:45Z'
---
# Refactor: Extract Release & Issue Syncers from SyncService

As the first step in the larger sync service refactoring (Epic: Refactor and Extend GitHub Sync Service), this ticket focuses on breaking down the monolithic `SyncService` into smaller, more focused modules.

**Tasks:**
1.  Create a new directory: `ai/mcp/server/github-workflow/services/sync/`.
2.  Create `sync/ReleaseSyncer.mjs` and move all release-related fetching and file-writing logic into it from `SyncService`.
3.  Create `sync/IssueSyncer.mjs` and move all issue-related pull, push, and formatting logic into it from `SyncService`.
4.  Refactor `SyncService.mjs` to become a lean orchestrator that imports and calls the new `ReleaseSyncer` and `IssueSyncer` modules.
5.  Update comments and method names within `SyncService` to be more generic and accurate.

## Timeline

- 2025-10-25T10:21:44Z @tobiu added the `epic` label
- 2025-10-25T10:21:44Z @tobiu added the `ai` label
- 2025-10-25T10:21:44Z @tobiu added the `refactoring` label
- 2025-10-25T10:23:18Z @tobiu cross-referenced by #7645
- 2025-10-25T10:24:41Z @tobiu assigned to @tobiu
- 2025-10-25T10:24:45Z @tobiu removed the `epic` label
- 2025-10-25T10:24:52Z @tobiu added parent issue #7645
- 2025-10-25T11:21:51Z @tobiu referenced in commit `6debaaf` - "Refactor: Extract Release & Issue Syncers from SyncService #7642"
- 2025-10-25T11:38:41Z @tobiu referenced in commit `f390a54` - "#7642 cleanup"
- 2025-10-25T11:40:45Z @tobiu closed this issue

