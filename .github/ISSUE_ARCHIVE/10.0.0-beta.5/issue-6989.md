---
id: 6989
title: 'v10 component.Base: mergeConfig() => smarter vdom aggregation'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-09T00:08:40Z'
updatedAt: '2025-07-09T00:09:06Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6989'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-07-09T00:09:06Z'
---
# v10 component.Base: mergeConfig() => smarter vdom aggregation

**Reported by:** @tobiu on 2025-07-09

* We can not use `Neo.merge()` here, since `vdom` contains arrays, which will get replaced

