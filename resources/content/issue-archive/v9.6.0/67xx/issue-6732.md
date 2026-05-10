---
id: 6732
title: 'buildScripts/buildAll: add the esm env'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-06-01T09:40:36Z'
updatedAt: '2025-06-01T09:56:49Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6732'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-06-01T09:56:49Z'
---
# buildScripts/buildAll: add the esm env

*(No description provided)*

## Timeline

- 2025-06-01T09:40:36Z @tobiu assigned to @tobiu
- 2025-06-01T09:40:37Z @tobiu added the `enhancement` label
- 2025-06-01T09:40:56Z @tobiu referenced in commit `3e4675d` - "buildScripts/buildAll: add the esm env #6732"
- 2025-06-01T09:41:07Z @tobiu closed this issue
### @tobiu - 2025-06-01T09:56:19Z

Changing the strategy:
* First I wanted to trigger the `dist/esm` build from within `buildThreads`, but this does not really make sense, since it is purely webpack related.
* Instead, `buildAll` should trigger it directly.

- 2025-06-01T09:56:19Z @tobiu reopened this issue
- 2025-06-01T09:56:32Z @tobiu referenced in commit `65d9bee` - "buildScripts/buildAll: add the esm env #6732"
- 2025-06-01T09:56:49Z @tobiu closed this issue

