---
id: 3272
title: Unnecesary DOM updates are generated without a `parentId`
state: CLOSED
labels:
  - bug
  - stale
assignees:
  - tobiu
createdAt: '2022-07-11T08:52:11Z'
updatedAt: '2024-09-13T02:30:07Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3272'
author: davhm
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-13T02:30:07Z'
---
# Unnecesary DOM updates are generated without a `parentId`

When using a `TableContainer` in a hash-routed view (might be partial cause?), the loaded UI will be broken by containing duplicated DOM nodes at the top level of the document.

### Reproduction
No reliable reproduction steps have been identified. 
The client project where this bug appears is known and currently accesible by @tobiu

### Analysis
Inspecting the DOM reveals too many top-level nodes are added.
Logging reveals that several malformed DOM updates are arriving in the main thread, 
These updates contain nodes without a `parentId`, and thus they are inserted at the DOM's top-level.
This breaks the UI.

## Timeline

- 2022-07-11T08:52:18Z @davhm added the `bug` label
- 2022-07-11T08:52:22Z @davhm assigned to @tobiu
- 2022-07-11T09:58:19Z @davhm changed title from **Fix broken DOM updates without a `parentId`** to **Unnecesary DOM updates are generated without a `parentId`**
- 2022-07-18T09:00:23Z @davhm cross-referenced by #3298
### @github-actions - 2024-08-30T02:27:58Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-30T02:27:58Z @github-actions added the `stale` label
### @github-actions - 2024-09-13T02:30:07Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-13T02:30:07Z @github-actions closed this issue

