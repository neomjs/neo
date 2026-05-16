---
id: 5600
title: 'form.field.Base: remove the static delayable class field'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-07-21T00:03:30Z'
updatedAt: '2024-07-21T00:04:04Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5600'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-07-21T00:04:04Z'
---
# form.field.Base: remove the static delayable class field

the delay of 1s for change events was intended for a client project to delay potential ajax calls to a backend.

obviously this should not be the framework default, but get implemented on app level if needed (using delayable for the change event handlers).

## Timeline

- 2024-07-21T00:03:30Z @tobiu added the `enhancement` label
- 2024-07-21T00:03:30Z @tobiu assigned to @tobiu
- 2024-07-21T00:03:52Z @tobiu referenced in commit `1523968` - "form.field.Base: remove the static delayable class field #5600"
- 2024-07-21T00:04:04Z @tobiu closed this issue

