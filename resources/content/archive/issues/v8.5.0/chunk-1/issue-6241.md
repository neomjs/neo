---
id: 6241
title: 'examples.grid.bigData.GridContainer: updating the columns is visually broken'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2025-01-15T18:30:04Z'
updatedAt: '2025-01-15T19:05:57Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6241'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-01-15T19:05:57Z'
---
# examples.grid.bigData.GridContainer: updating the columns is visually broken

This does not happen inside the last neo version (deployed), but inside the current state of the dev branch.

![Image](https://github.com/user-attachments/assets/12b7b10e-957a-4e6d-8c85-530f682351c9)

I added some testing logs:

![Image](https://github.com/user-attachments/assets/00ca2ad5-ad1a-469b-ac46-4e3afc715a57)

It seems like `header.Toolbar` wants to do an update, containing the correct vdom & vnode, but it gets blocked.

Stepping through `component.Base` to resolve it.

## Timeline

- 2025-01-15T18:30:04Z @tobiu added the `bug` label
- 2025-01-15T18:30:04Z @tobiu assigned to @tobiu
- 2025-01-15T19:05:32Z @tobiu referenced in commit `9085a1a` - "examples.grid.bigData.GridContainer: updating the columns is visually broken #6241"
- 2025-01-15T19:05:57Z @tobiu closed this issue

