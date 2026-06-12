---
id: 5546
title: 'tests/VdomHelper: adjust the replaceChild delta test'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-07-09T11:30:45Z'
updatedAt: '2024-07-09T11:31:24Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5546'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-07-09T11:31:24Z'
---
# tests/VdomHelper: adjust the replaceChild delta test

we need to switch to `moveNode` & `removeNode` instead, since adding `replaceChild` to the new logic does not feel worth it => way too expensive.

## Timeline

- 2024-07-09T11:30:45Z @tobiu added the `enhancement` label
- 2024-07-09T11:30:46Z @tobiu assigned to @tobiu
- 2024-07-09T11:31:05Z @tobiu referenced in commit `b1eb700` - "tests/VdomHelper: adjust the replaceChild delta test #5546"
- 2024-07-09T11:31:24Z @tobiu closed this issue

