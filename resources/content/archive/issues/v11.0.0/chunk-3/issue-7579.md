---
id: 7579
title: Track and Handle Failed Pushes in SyncService
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-20T13:25:18Z'
updatedAt: '2025-10-21T08:59:48Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7579'
author: tobiu
commentsCount: 0
parentIssue: 7564
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-21T08:59:48Z'
---
# Track and Handle Failed Pushes in SyncService

Currently, if a local issue file is modified but the corresponding issue is deleted on GitHub, the push operation will fail silently on every sync. We need to track these failures to prevent repeated API calls and to aid in debugging.

## Acceptance Criteria

1.  The `catch` block in the `#pushToGitHub` loop is updated to log the specific error message from the `gh` command.
2.  A `push_failures` array is added to the metadata object that is managed throughout the sync process.
3.  When a push for an issue fails, its number is added to the `push_failures` array.
4.  The `#pushToGitHub` logic is updated to check if an issue number is present in the `metadata.push_failures` from the previous sync. If it is, the service should skip attempting to push it again and log a debug message.
5.  After a full sync cycle, if an issue that was previously in `push_failures` is successfully pulled (i.e., it exists on GitHub again), it should be removed from the `push_failures` list in the new metadata.

## Timeline

- 2025-10-20T13:25:19Z @tobiu assigned to @tobiu
- 2025-10-20T13:25:20Z @tobiu added the `enhancement` label
- 2025-10-20T13:25:20Z @tobiu added parent issue #7564
- 2025-10-20T13:25:21Z @tobiu added the `ai` label
- 2025-10-21T08:59:36Z @tobiu referenced in commit `2071add` - "Track and Handle Failed Pushes in SyncService #7579"
- 2025-10-21T08:59:48Z @tobiu closed this issue

