---
id: 6283
title: 'data.RecordFactory: record => reset()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-01-24T14:34:51Z'
updatedAt: '2025-01-24T14:36:49Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6283'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-01-24T14:36:47Z'
---
# data.RecordFactory: record => reset()

change the `originalData` & `data` in parallel.

needed when doing a change which should not flag a field as changed / dirty.

## Comments

### @tobiu - 2025-01-24 14:36

`reset()` will not add the orange triangle inside the table cell:

![Image](https://github.com/user-attachments/assets/62aa1b77-a710-4532-91ce-b9fcd3536fc8)

using `set()` will:

![Image](https://github.com/user-attachments/assets/04209613-5a8e-41c2-aee1-08c71769618d)

## Activity Log

- 2025-01-24 @tobiu added the `enhancement` label
- 2025-01-24 @tobiu assigned to @tobiu
- 2025-01-24 @tobiu referenced in commit `b389f56` - "data.RecordFactory: record => reset() #6283"
- 2025-01-24 @tobiu closed this issue

