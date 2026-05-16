---
id: 144
title: 'Performance testing: Fragments VS insertAdjacentHTML'
state: CLOSED
labels:
  - enhancement
  - stale
assignees: []
createdAt: '2019-12-04T13:40:45Z'
updatedAt: '2024-09-29T02:38:33Z'
githubUrl: 'https://github.com/neomjs/neo/issues/144'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-29T02:38:32Z'
---
# Performance testing: Fragments VS insertAdjacentHTML

This only matters for inserting new DOM nodes, not for delta updates.

Since the last performance testing round might be outdated, we should do some performance now testing to see if insertAdjacentHTML() is still the fastest way.

https://developer.mozilla.org/en-US/docs/Web/API/DocumentFragment

## Timeline

- 2019-12-04T13:40:45Z @tobiu added the `enhancement` label
### @github-actions - 2024-09-14T02:28:11Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-09-14T02:28:11Z @github-actions added the `stale` label
### @github-actions - 2024-09-29T02:38:32Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-29T02:38:32Z @github-actions closed this issue

