---
id: 5343
title: 'form.field.Select: originalConfig.value'
state: CLOSED
labels:
  - enhancement
  - stale
assignees:
  - tobiu
createdAt: '2024-03-15T13:48:47Z'
updatedAt: '2024-09-12T02:27:59Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5343'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-12T02:27:59Z'
---
# form.field.Select: originalConfig.value

With the new separation of `inputValue` (string) and `value` (record), we need to adjust the `originalConfig.value` too.

loading a form will only pass a `recordId` which then get mapped into a record inside `beforeSetValue()`.

To check if a field `isDirty`, we need to compare 2 records.

We could either create a new logic to compare a `recordId` inside the orginialConfig with the current value record OR store the record inside the originalConfig too.

@ExtAnimal 

## Timeline

- 2024-03-15T13:48:47Z @tobiu added the `enhancement` label
- 2024-03-15T13:48:48Z @tobiu assigned to @tobiu
### @github-actions - 2024-08-29T02:25:25Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-29T02:25:25Z @github-actions added the `stale` label
### @github-actions - 2024-09-12T02:27:58Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-12T02:27:59Z @github-actions closed this issue

