---
id: 3735
title: data.field.* are not used
state: CLOSED
labels:
  - bug
  - stale
assignees: []
createdAt: '2023-01-02T00:08:55Z'
updatedAt: '2024-09-14T02:26:28Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3735'
author: Dinkh
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-14T02:26:27Z'
---
# data.field.* are not used

Currently the data.field.* are not used if set in the model fields.

Example:
```
fields: [{
    name: 'id',
    ntype: 'data-field-float'
}]
```

The ntype is not used.

## Timeline

- 2023-01-02T00:08:55Z @Dinkh added the `bug` label
### @github-actions - 2024-08-30T02:27:26Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-30T02:27:26Z @github-actions added the `stale` label
### @github-actions - 2024-09-14T02:26:27Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-14T02:26:27Z @github-actions closed this issue

