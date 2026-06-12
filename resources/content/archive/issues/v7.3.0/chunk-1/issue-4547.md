---
id: 4547
title: 'dialog.Base: hide() & show() do not adjust the hidden config'
state: CLOSED
labels:
  - bug
  - stale
assignees: []
createdAt: '2023-07-13T14:25:27Z'
updatedAt: '2024-09-13T02:29:36Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4547'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-13T02:29:35Z'
---
# dialog.Base: hide() & show() do not adjust the hidden config

`dialog.Base` overrides the methods of `component.Base` without triggering a super call (intentionally).

however, they should also change the value of `this._hidden` for consistency reasons.

@Dinkh 

## Timeline

- 2023-07-13T14:25:28Z @tobiu added the `bug` label
- 2023-07-13T14:27:57Z @tobiu cross-referenced by #4548
### @github-actions - 2024-08-29T02:27:01Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-29T02:27:02Z @github-actions added the `stale` label
### @github-actions - 2024-09-13T02:29:35Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-13T02:29:35Z @github-actions closed this issue

