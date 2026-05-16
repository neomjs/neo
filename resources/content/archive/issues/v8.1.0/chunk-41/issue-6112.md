---
id: 6112
title: 'component.Base: updateVdom() => remove the reference check'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-11-14T17:51:52Z'
updatedAt: '2024-11-14T17:54:36Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6112'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-11-14T17:54:36Z'
---
# component.Base: updateVdom() => remove the reference check

in v8, containers no longer store references to the vdom of child items, so we do not need to enforce it as strict as before.

## Timeline

- 2024-11-14T17:51:52Z @tobiu added the `enhancement` label
- 2024-11-14T17:51:52Z @tobiu assigned to @tobiu
- 2024-11-14T17:54:15Z @tobiu referenced in commit `1f8fe8b` - "component.Base: updateVdom() => remove the reference check #6112"
- 2024-11-14T17:54:36Z @tobiu closed this issue

