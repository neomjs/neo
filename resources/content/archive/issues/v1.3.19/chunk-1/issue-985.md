---
id: 985
title: 'vdom.Helper: createDeltas()'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2020-07-29T13:49:35Z'
updatedAt: '2020-07-29T13:50:12Z'
githubUrl: 'https://github.com/neomjs/neo/issues/985'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-07-29T13:50:12Z'
---
# vdom.Helper: createDeltas()

Edge case bug: infinite scrolling upwards

add new nodes at the start, remove nodes at the end of a childNodes array.

right now, this does add the new nodes, but does not remove the old ones.

on it.


## Timeline

- 2020-07-29T13:49:35Z @tobiu added the `bug` label
- 2020-07-29T13:49:36Z @tobiu assigned to @tobiu
- 2020-07-29T13:50:07Z @tobiu referenced in commit `f4c2f6f` - "vdom.Helper: createDeltas() #985"
- 2020-07-29T13:50:12Z @tobiu closed this issue

