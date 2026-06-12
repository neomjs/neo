---
id: 7571
title: Refactor Sync Config for Dynamic Date-Based Syncing
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-20T12:43:12Z'
updatedAt: '2025-10-20T12:53:57Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7571'
author: tobiu
commentsCount: 0
parentIssue: 7564
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-20T12:53:57Z'
---
# Refactor Sync Config for Dynamic Date-Based Syncing

To make the issue synchronization process scalable and efficient, we need to move away from a static release list and instead use a date-based approach to limit the scope of the sync. This involves removing the hardcoded `releases` array from the configuration and replacing it with a single `syncStartDate`.

## Acceptance Criteria

1.  The `ai/mcp/server/config.mjs` file is updated.
2.  The `githubWorkflow.issueSync.releases` array is **removed**.
3.  A new string property, `githubWorkflow.issueSync.syncStartDate`, is added. Its value should be set to a reasonable default, like `'2024-01-01T00:00:00Z'`, to limit the sync to recent v10+ issues.

## Benefits

-   Decouples the sync logic from a static, manually maintained list of releases.
-   Provides a single, simple configuration point for controlling the time window of the synchronization.
-   Paves the way for the service to dynamically fetch release data from GitHub.

## Timeline

- 2025-10-20T12:43:12Z @tobiu assigned to @tobiu
- 2025-10-20T12:43:13Z @tobiu added the `enhancement` label
- 2025-10-20T12:43:13Z @tobiu added parent issue #7564
- 2025-10-20T12:43:14Z @tobiu added the `ai` label
- 2025-10-20T12:53:43Z @tobiu referenced in commit `323d5a4` - "Refactor Sync Config for Dynamic Date-Based Syncing #7571"
- 2025-10-20T12:53:57Z @tobiu closed this issue

