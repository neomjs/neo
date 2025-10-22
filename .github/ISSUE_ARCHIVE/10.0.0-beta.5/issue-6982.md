---
id: 6982
title: v10 state.Provider enhancements
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-07T22:19:05Z'
updatedAt: '2025-07-07T22:19:43Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6982'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-07-07T22:19:43Z'
---
# v10 state.Provider enhancements

**Reported by:** @tobiu on 2025-07-07

The rewrite to fully embrace the new reactivity model in neo needs some adjustments:

* Restore the lost `onDataPropertyChange()` logic.
* Restore the ability to store `data.Records` inside state provider data.
* Polish edge-cases, where data access bypassed the proxy

