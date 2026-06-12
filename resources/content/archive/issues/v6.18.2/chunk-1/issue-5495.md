---
id: 5495
title: 'dialog.Base: centering logic'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-06-29T16:03:26Z'
updatedAt: '2024-06-29T16:17:38Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5495'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-06-29T16:17:38Z'
---
# dialog.Base: centering logic

it is time to get rid of:
```
    &.neo-centered {
        left      : 50%;
        top       : 50%;
        transform : translate(-50%, -50%);
    }
```

by default, a `position: fixed` div should already be centered.

however, the logic of `animateShow()` needs to grab the size of the offscreen rendered dialog & document body, to animate it to a calculated centered position.

## Timeline

- 2024-06-29T16:03:26Z @tobiu added the `enhancement` label
- 2024-06-29T16:03:26Z @tobiu assigned to @tobiu
- 2024-06-29T16:06:10Z @tobiu referenced in commit `c133791` - "dialog.Base: centering logic #5495"
- 2024-06-29T16:07:49Z @tobiu referenced in commit `8736e4a` - "#5495 dialog.Base: removing the centered_ config"
- 2024-06-29T16:17:38Z @tobiu closed this issue

