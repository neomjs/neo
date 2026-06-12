---
id: 3499
title: 'toolbar.Base: weird styles when dragging buttons using `tabBarPosition: ''right`'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2022-10-02T17:32:24Z'
updatedAt: '2022-10-02T17:34:09Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3499'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-10-02T17:34:09Z'
---
# toolbar.Base: weird styles when dragging buttons using `tabBarPosition: 'right`

changing the bottom, left, right, top values from inherit to unset fixes it.

i am a bit clueless why this work fine for `tabBarPosition: 'left'`.

## Timeline

- 2022-10-02T17:32:24Z @tobiu added the `bug` label
- 2022-10-02T17:32:24Z @tobiu assigned to @tobiu
- 2022-10-02T17:34:03Z @tobiu referenced in commit `c6d5eb6` - "toolbar.Base: weird styles when dragging buttons using tabBarPosition: 'right #3499"
- 2022-10-02T17:34:09Z @tobiu closed this issue

