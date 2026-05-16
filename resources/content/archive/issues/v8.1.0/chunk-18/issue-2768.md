---
id: 2768
title: 'worker.Message: switch back from construct to constructor'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2021-12-12T17:22:54Z'
updatedAt: '2021-12-12T17:23:29Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2768'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-12-12T17:23:29Z'
---
# worker.Message: switch back from construct to constructor

this class is an edge case and not supposed to be a real neo class. using the real ctor makes more sense.

## Timeline

- 2021-12-12T17:22:54Z @tobiu added the `bug` label
- 2021-12-12T17:22:54Z @tobiu assigned to @tobiu
- 2021-12-12T17:23:22Z @tobiu referenced in commit `8f711ac` - "worker.Message: switch back from construct to constructor #2768"
- 2021-12-12T17:23:30Z @tobiu closed this issue

