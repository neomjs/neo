---
id: 6827
title: 'main.DeltaUpdates: createDomTree() => enhanced logic'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-06-17T11:15:42Z'
updatedAt: '2025-06-17T11:16:07Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6827'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-06-17T11:16:07Z'
---
# main.DeltaUpdates: createDomTree() => enhanced logic

**Reported by:** @tobiu on 2025-06-17

* build a detached DOM tree, once done, directly inject it into the live DOM
* since we are just adding one finished tree after detached construction, we can skip using a fragment
* exception: vtype text => fragment since 3 nodes
* the method should handle the live dom insertion on its own.

