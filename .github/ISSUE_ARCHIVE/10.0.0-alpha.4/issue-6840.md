---
id: 6840
title: 'vdom.VNode: normalizeClassName()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-06-18T20:53:29Z'
updatedAt: '2025-06-18T20:53:52Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6840'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-06-18T20:53:52Z'
---
# vdom.VNode: normalizeClassName()

**Reported by:** @tobiu on 2025-06-18

* important: module based method, not class based
* VNodes get serialised to get passed via ´postMessage´, so there would be more iterations
* Negligible from a performance perspective, but the main argument is purity

