---
id: 207
title: 'Neo.Xhr: relative URLs inside the framework repo'
state: CLOSED
labels:
  - enhancement
  - stale
assignees:
  - tobiu
createdAt: '2019-12-30T00:35:55Z'
updatedAt: '2024-09-28T02:32:29Z'
githubUrl: 'https://github.com/neomjs/neo/issues/207'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-28T02:32:28Z'
---
# Neo.Xhr: relative URLs inside the framework repo

This topic is a bit more complex:

Since all requests go through the data-worker, the base URL is 2 levels below the repo root.

in case we do use neo.mjs as a node_module, there is a check in place to reduce the 4 levels below the workspace to 2 (consistency) => #206 

However, in case there are Neo.Xhr calls within the repo, we don't want to change the paths (e.g. inside the examples).

Since we are in strict mode, there is no way to know which class / file triggered the call (callee). I think we need another optional Neo.Xhr config like `insideNeo` to deal with those edge cases.

## Timeline

- 2019-12-30T00:35:55Z @tobiu added the `enhancement` label
- 2019-12-30T00:35:55Z @tobiu assigned to @tobiu
- 2020-01-02T11:28:46Z @tobiu referenced in commit `d703853` - "https://github.com/neomjs/neo/issues/207"
### @github-actions - 2024-09-14T02:28:09Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-09-14T02:28:09Z @github-actions added the `stale` label
### @github-actions - 2024-09-28T02:32:28Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-28T02:32:28Z @github-actions closed this issue

