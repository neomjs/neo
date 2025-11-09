---
id: 7066
title: 'collection.Base: remove `afterSetCount()`'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-15T18:06:33Z'
updatedAt: '2025-07-15T18:07:35Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7066'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-07-15T18:07:35Z'
---
# collection.Base: remove `afterSetCount()`

**Reported by:** @tobiu on 2025-07-15

* firing a custom event was needed for a `state.Provider` reactive effects demo, before the support for binding to store configs was in place.
* obsolete now.

