---
id: 7606
title: Rename `sync_issues` Tool to `sync_all` for Clarity
state: CLOSED
labels:
  - enhancement
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-10-22T12:12:53Z'
updatedAt: '2025-10-22T12:14:19Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7606'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-22T12:14:19Z'
---
# Rename `sync_issues` Tool to `sync_all` for Clarity

The current tool for performing a full bi-directional synchronization with GitHub is named `sync_issues`. This name is misleading, as the underlying `SyncService.runFullSync()` method does more than just sync issues—it also fetches and syncs release notes.

To improve clarity and accurately reflect the tool's function for all consumers (both human and AI), the tool should be renamed to `sync_all`.

## Acceptance Criteria

1.  In `ai/mcp/server/github-workflow/openapi.yaml`, the `operationId` for the `POST /sync-issues` endpoint is changed from `sync_issues` to `sync_all`.
2.  The path of the endpoint is changed from `/sync-issues` to `/sync-all` for consistency.
3.  In `ai/mcp/server/github-workflow/services/toolService.mjs`, the entry in the `serviceMapping` object is updated from `sync_issues` to `sync_all`.

## Activity Log

- 2025-10-22 @tobiu assigned to @tobiu
- 2025-10-22 @tobiu added the `enhancement` label
- 2025-10-22 @tobiu added the `ai` label
- 2025-10-22 @tobiu added the `refactoring` label
- 2025-10-22 @tobiu referenced in commit `828b0c5` - "Rename sync_issues Tool to sync_all for Clarity #7606"
- 2025-10-22 @tobiu closed this issue

