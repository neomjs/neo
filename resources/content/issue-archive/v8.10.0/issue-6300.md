---
id: 6300
title: 'selection.grid.CellModel: adjust the basic navigation logic'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-01-26T18:06:09Z'
updatedAt: '2025-01-26T18:06:45Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6300'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-01-26T18:06:43Z'
---
# selection.grid.CellModel: adjust the basic navigation logic

* since neither grid rows nor cells contain `tabIndex = -1`, we need to remove any path related logic (the root path is the grid wrapper)

## Comments

### @tobiu - 2025-01-26 18:06

https://github.com/user-attachments/assets/85dec71e-f814-4405-b090-d4dbdede300b

## Activity Log

- 2025-01-26 @tobiu added the `enhancement` label
- 2025-01-26 @tobiu assigned to @tobiu
- 2025-01-26 @tobiu referenced in commit `fecca0b` - "selection.grid.CellModel: adjust the basic navigation logic #6300"
- 2025-01-26 @tobiu closed this issue

