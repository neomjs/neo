---
id: 6539
title: 'grid.View: updateCellNode()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-03-03T22:09:31Z'
updatedAt: '2025-03-03T22:10:25Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6539'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-03-03T22:10:23Z'
---
# grid.View: updateCellNode()

`onStoreRecordChange()` needs an additional update, in case:

1. it is a component based column
2. the component is defined as a function
3. the `dataField` of the component is not present inside the changed fields

To not create redundancy, we need the new method.

## Timeline

- 2025-03-03T22:09:31Z @tobiu added the `enhancement` label
- 2025-03-03T22:09:31Z @tobiu assigned to @tobiu
- 2025-03-03T22:09:50Z @tobiu referenced in commit `bd3de39` - "grid.View: updateCellNode() #6539"
### @tobiu - 2025-03-03T22:10:23Z

https://github.com/user-attachments/assets/cf8515f8-f663-4693-8ce3-ea7120d2fcab

- 2025-03-03T22:10:23Z @tobiu closed this issue

