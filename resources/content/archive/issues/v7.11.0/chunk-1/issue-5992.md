---
id: 5992
title: remove manager.Store
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-09-30T21:48:50Z'
updatedAt: '2024-09-30T21:49:34Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5992'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-30T21:49:34Z'
---
# remove manager.Store

long story short:
* the table is one of the oldest neo components
* for examples/tablePerformance, I used a data worker driven dummy table data generator
* obviously this one was not meant to stay this long (not used otherwise)
* to clean it up, the example needs to generate its own data

## Timeline

- 2024-09-30T21:48:50Z @tobiu added the `enhancement` label
- 2024-09-30T21:48:51Z @tobiu assigned to @tobiu
- 2024-09-30T21:49:25Z @tobiu referenced in commit `d218343` - "remove manager.Store #5992"
- 2024-09-30T21:49:34Z @tobiu closed this issue

