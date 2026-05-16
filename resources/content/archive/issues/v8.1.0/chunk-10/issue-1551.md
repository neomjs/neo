---
id: 1551
title: 'worker.App: connect & disconnect events'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-03-21T11:58:50Z'
updatedAt: '2021-03-21T12:02:01Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1551'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-03-21T12:02:01Z'
---
# worker.App: connect & disconnect events

right now, the worker is firing the events on each application main view, which does not feel clean.

instead, the app worker should fire them on itself.

## Timeline

- 2021-03-21T11:58:50Z @tobiu added the `enhancement` label
- 2021-03-21T11:58:50Z @tobiu assigned to @tobiu
- 2021-03-21T11:59:43Z @tobiu referenced in commit `a1d8340` - "worker.App: connect & disconnect events #1551"
- 2021-03-21T12:01:48Z @tobiu referenced in commit `b260306` - "#1551 adjusted the shared covid app"
- 2021-03-21T12:02:01Z @tobiu closed this issue

