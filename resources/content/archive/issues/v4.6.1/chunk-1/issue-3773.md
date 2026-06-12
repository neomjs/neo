---
id: 3773
title: 'form.field.Text: afterSetValue() => `neo-is-dirty` gets applied when value === null && originalConfig.value === undefined'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2023-01-04T15:13:37Z'
updatedAt: '2023-01-04T15:22:01Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3773'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-01-04T15:22:01Z'
---
# form.field.Text: afterSetValue() => `neo-is-dirty` gets applied when value === null && originalConfig.value === undefined

we should check if both options are "empty" too.

## Timeline

- 2023-01-04T15:13:37Z @tobiu added the `bug` label
- 2023-01-04T15:13:38Z @tobiu assigned to @tobiu
- 2023-01-04T15:21:03Z @tobiu referenced in commit `1c8b91a` - "form.field.Text: afterSetValue() => neo-is-dirty gets applied when value === null && originalConfig.value === undefined #3773"
- 2023-01-04T15:22:01Z @tobiu closed this issue

