---
id: 3921
title: 'form.field.Text: width: 140px is too restrictive'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2023-01-20T11:34:35Z'
updatedAt: '2023-01-20T11:35:19Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3921'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-01-20T11:35:19Z'
---
# form.field.Text: width: 140px is too restrictive

inside flex or grid layouts, this prevents fields to span the fully available width.

we should use `min-width: 50px` instead.

## Timeline

- 2023-01-20T11:34:35Z @tobiu added the `bug` label
- 2023-01-20T11:34:36Z @tobiu assigned to @tobiu
- 2023-01-20T11:34:57Z @tobiu referenced in commit `77db538` - "form.field.Text: width: 140px is too restrictive #3921"
- 2023-01-20T11:35:19Z @tobiu closed this issue

