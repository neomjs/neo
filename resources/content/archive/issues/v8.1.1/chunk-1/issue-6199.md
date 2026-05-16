---
id: 6199
title: 'grid.header.Button: a click seems to update the next column'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2025-01-11T15:48:14Z'
updatedAt: '2025-01-11T16:51:17Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6199'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-01-11T16:51:15Z'
---
# grid.header.Button: a click seems to update the next column

https://github.com/user-attachments/assets/0cf8749e-ddc4-48c9-b58d-87db6456460a

Will take a look into this one next.

## Timeline

- 2025-01-11T15:48:14Z @tobiu added the `bug` label
- 2025-01-11T15:48:14Z @tobiu assigned to @tobiu
### @tobiu - 2025-01-11T16:17:13Z

It looks like the ripple effect wrapper is pushing the content outside:

![Image](https://github.com/user-attachments/assets/3b7af1f5-03c8-46a9-bc33-1273a1c72920)

- 2025-01-11T16:49:48Z @tobiu referenced in commit `e768f65` - "grid.header.Button: a click seems to update the next column #6199"
### @tobiu - 2025-01-11T16:51:16Z

https://github.com/user-attachments/assets/d85f9ecc-c554-481a-91ce-32f4eae1c370

- 2025-01-11T16:51:16Z @tobiu closed this issue

