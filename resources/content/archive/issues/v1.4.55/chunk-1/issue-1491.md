---
id: 1491
title: 'dialog.Base: initial drag proxy positioning for % based positions'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2021-01-18T12:47:04Z'
updatedAt: '2021-01-18T13:21:07Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1491'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-01-18T13:21:07Z'
---
# dialog.Base: initial drag proxy positioning for % based positions

while the 2nd+ drag op works like expected, the first drag can render the proxy el at a wrong spot in case we are using % based sizes and / or positions.

this worked before and it is most likely just a timing issue (getting the DOMRect info).

looking into it now.

## Timeline

- 2021-01-18T12:47:04Z @tobiu added the `bug` label
- 2021-01-18T12:47:04Z @tobiu assigned to @tobiu
- 2021-01-18T13:20:12Z @tobiu referenced in commit `4206f2b` - "dialog.Base: initial drag proxy positioning for % based positions #1491"
### @tobiu - 2021-01-18T13:21:07Z

the positioning was actually correct, but since dialogs are not using a proxy wrapper, the transform style did not get reset.

- 2021-01-18T13:21:07Z @tobiu closed this issue

