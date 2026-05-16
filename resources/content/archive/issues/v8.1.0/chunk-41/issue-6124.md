---
id: 6124
title: 'list.Color: colorField => colorField_'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2024-11-19T15:41:42Z'
updatedAt: '2024-11-19T15:42:24Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6124'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-11-19T15:42:23Z'
---
# list.Color: colorField => colorField_

we need to get the current value into the `configSymbol`, to get changed  values immediately.

otherwise this can cause issues when showing the list for the first time with a changed value:

![Image](https://github.com/user-attachments/assets/0e0f3db2-6fdf-45a0-8700-41ae3a5ef425)


## Timeline

- 2024-11-19T15:41:42Z @tobiu added the `bug` label
- 2024-11-19T15:41:43Z @tobiu assigned to @tobiu
- 2024-11-19T15:42:09Z @tobiu referenced in commit `6c7cf46` - "list.Color: colorField => colorField_ #6124"
### @tobiu - 2024-11-19T15:42:23Z

![Image](https://github.com/user-attachments/assets/7ec20a95-1cd4-4298-8a41-ec479d51d753)


- 2024-11-19T15:42:23Z @tobiu closed this issue

