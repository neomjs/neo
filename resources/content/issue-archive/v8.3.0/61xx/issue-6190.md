---
id: 6190
title: 'grid.View: afterSetScrollPosition() => only change the startIndex when scrolling more than the buffer row range'
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2025-01-08T10:38:53Z'
updatedAt: '2025-01-12T19:05:36Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6190'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-01-12T19:05:35Z'
---
# grid.View: afterSetScrollPosition() => only change the startIndex when scrolling more than the buffer row range

right now, we update `startIndex` when scrolling more than 1 row. with the introduction of `bufferRowRange`, we need to change it to only trigger a view update when scrolling more than the range instead => performance.

## Timeline

- 2025-01-08T10:38:53Z @tobiu added the `enhancement` label
- 2025-01-09T13:18:33Z @tobiu referenced in commit `c2b69bf` - "grid.View: afterSetScrollPosition() => only change the startIndex when scrolling more than the buffer row range #6190 WIP"
### @tobiu - 2025-01-12T19:05:35Z

done.

- 2025-01-12T19:05:35Z @tobiu closed this issue

