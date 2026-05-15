---
id: 6295
title: 'dialog.Base: animateShow() => dragging, hiding & showing leeds to an initial rendering inside the visible area'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2025-01-25T21:32:05Z'
updatedAt: '2025-01-25T21:34:47Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6295'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-01-25T21:34:46Z'
---
# dialog.Base: animateShow() => dragging, hiding & showing leeds to an initial rendering inside the visible area

to make sense of it:

https://github.com/user-attachments/assets/e8320066-4906-4aa3-9c81-46cbacd067de

* a floating component starts with a CSS based `left` & `top` position with big negative values
* after a drag OP, the style now contains a `left` & `top` value
* when re-showing, this one does get used for the initial rendering (size measurement)
* We need to ensure the initial mounting is offscreen
* The last final position should get kept though

## Timeline

- 2025-01-25T21:32:05Z @tobiu added the `bug` label
- 2025-01-25T21:32:05Z @tobiu assigned to @tobiu
- 2025-01-25T21:34:33Z @tobiu referenced in commit `5dcba23` - "dialog.Base: animateShow() => dragging, hiding & showing leeds to an initial rendering inside the visible area #6295"
### @tobiu - 2025-01-25T21:34:46Z

https://github.com/user-attachments/assets/a3e692e8-4484-4013-85fa-f14742c1ede7

- 2025-01-25T21:34:46Z @tobiu closed this issue

