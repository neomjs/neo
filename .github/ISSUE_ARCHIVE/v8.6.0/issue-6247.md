---
id: 6247
title: 'data.RecordFactory: performance improvement needed for big data'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-01-16T16:28:01Z'
updatedAt: '2025-01-16T16:29:44Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6247'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-01-16T16:29:43Z'
---
# data.RecordFactory: performance improvement needed for big data

* the current solution is creating fields inside the class ctor. this should happen when constructing the class itself => prototype level.

![Image](https://github.com/user-attachments/assets/3e3cd6fc-1c99-4ae5-8d5f-d4c602e30a6d)

## Comments

### @tobiu - 2025-01-16 16:29

![Image](https://github.com/user-attachments/assets/cbe28f52-621f-476d-b8af-c6a43c803030)

## Activity Log

- 2025-01-16 @tobiu added the `enhancement` label
- 2025-01-16 @tobiu assigned to @tobiu
- 2025-01-16 @tobiu referenced in commit `3ef0e5f` - "data.RecordFactory: performance improvement needed for big data #6247"
- 2025-01-16 @tobiu closed this issue
- 2025-01-16 @tobiu referenced in commit `2a08dda` - "#6247 -testing log"

