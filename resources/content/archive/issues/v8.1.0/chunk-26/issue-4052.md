---
id: 4052
title: 'form.field.Select: afterSetValue() => list silentVdomUpdate'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2023-02-13T18:41:25Z'
updatedAt: '2023-02-13T18:44:39Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4052'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-02-13T18:44:39Z'
---
# form.field.Select: afterSetValue() => list silentVdomUpdate

the logic is from the time where the list vdom was a direct child node of the field DOM.

this is no longer the case (separate DOM nodes), so enabling the silent mode will prevent filters from updating and select field lists will show all items.

## Timeline

- 2023-02-13T18:41:25Z @tobiu added the `bug` label
- 2023-02-13T18:41:25Z @tobiu assigned to @tobiu
- 2023-02-13T18:43:52Z @tobiu referenced in commit `7608d14` - "form.field.Select: afterSetValue() => list silentVdomUpdate #4052"
- 2023-02-13T18:44:39Z @tobiu closed this issue

