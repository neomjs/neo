---
id: 6822
title: 'vdom.VNode: smarter vtype text handling'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-06-16T18:12:16Z'
updatedAt: '2025-06-16T18:12:36Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6822'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-06-16T18:12:36Z'
---
# vdom.VNode: smarter vtype text handling

**Reported by:** @tobiu on 2025-06-16

* use `textContent`
* Neo.vdom.util.StringFromVnode: create string based comments
* main.mixin.DeltaUpdates => opt out if no node
* DomApiVnodeCreator: opt out if no node

