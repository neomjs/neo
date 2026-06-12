---
id: 2767
title: 'vdom.VNode: switch back from construct to constructor'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2021-12-12T17:20:07Z'
updatedAt: '2021-12-12T17:23:02Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2767'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-12-12T17:23:02Z'
---
# vdom.VNode: switch back from construct to constructor

this class is an edge case and not supposed to be a real neo class. using the real ctor makes more sense.

## Timeline

- 2021-12-12T17:20:07Z @tobiu added the `bug` label
- 2021-12-12T17:20:08Z @tobiu assigned to @tobiu
- 2021-12-12T17:20:24Z @tobiu referenced in commit `ce76f0e` - "vdom.VNode: switch back from construct to constructor #2767"
- 2021-12-12T17:23:02Z @tobiu closed this issue

