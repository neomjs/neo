---
id: 5519
title: 'vdom.Helper: createDeltas() => remove findVnode() & add a flat map for the old & new vnode tree'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-07-03T19:12:41Z'
updatedAt: '2024-07-03T19:13:47Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5519'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-07-03T19:13:47Z'
---
# vdom.Helper: createDeltas() => remove findVnode() & add a flat map for the old & new vnode tree

too many tree queries and too complicated.

adding the flat maps will boost the performance.

## Timeline

- 2024-07-03T19:12:41Z @tobiu added the `enhancement` label
- 2024-07-03T19:12:41Z @tobiu assigned to @tobiu
- 2024-07-03T19:13:07Z @tobiu referenced in commit `17d0bd7` - "vdom.Helper: createDeltas() => remove findVnode() & add a flat map for the old & new vnode tree #5519"
- 2024-07-03T19:13:47Z @tobiu closed this issue

