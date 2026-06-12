---
id: 5592
title: 'vdom.Helper: createDeltas() => infinite scrolling is broken'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2024-07-19T21:51:41Z'
updatedAt: '2024-07-19T21:52:34Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5592'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-07-19T21:52:33Z'
---
# vdom.Helper: createDeltas() => infinite scrolling is broken

more precisely: calendar week view => scrolling to the left will insert new nodes, but no longer removes old nodes.

there is more to it, since it also affects inserted & moved indexes in arrays where items get removed.

## Timeline

- 2024-07-19T21:51:41Z @tobiu added the `bug` label
- 2024-07-19T21:51:41Z @tobiu assigned to @tobiu
- 2024-07-19T21:51:58Z @tobiu referenced in commit `9c2596d` - "vdom.Helper: createDeltas() => infinite scrolling is broken #5592"
### @tobiu - 2024-07-19T21:52:33Z

<img width="905" alt="Screenshot 2024-07-19 at 23 52 17" src="https://github.com/user-attachments/assets/f31a467a-159f-47e8-942c-e54a981be279">


- 2024-07-19T21:52:34Z @tobiu closed this issue

