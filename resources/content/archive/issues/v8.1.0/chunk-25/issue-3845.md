---
id: 3845
title: Fields with convert methods should be read-only
state: CLOSED
labels:
  - bug
  - stale
assignees: []
createdAt: '2023-01-11T17:23:37Z'
updatedAt: '2024-09-14T02:26:13Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3845'
author: maxrahder
commentsCount: 3
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-14T02:26:13Z'
---
# Fields with convert methods should be read-only

In my demo today I tried to use the debugger to assign a value to a calculated field. The field is named "title" and in the debugger I drilled-down to the `title: {...}` and entered a value. It didn't work, unsurprisingly, but I think the dynamically created Record class should _not_ give these fields "set" methods.

## Timeline

- 2023-01-11T17:23:37Z @maxrahder added the `bug` label
### @tobiu - 2023-01-12T09:06:55Z

Tagging Torsten @Dinkh.

Every record "field" (data prop) needs a setter to enable us to get change events. e.g. in case we create a custom "fullname" field which combines first- and lastname, we want to reflect any changes into e.g. a grid.

what we could do: "freezing" the prop so that manual changes do get prevented and the record factory would need to do an unfreeze, update, re-freeze. non trivial and up for discussion.

### @github-actions - 2024-08-30T02:27:13Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-30T02:27:13Z @github-actions added the `stale` label
### @github-actions - 2024-09-14T02:26:12Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-14T02:26:13Z @github-actions closed this issue

