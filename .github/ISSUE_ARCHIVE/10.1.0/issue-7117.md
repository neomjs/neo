---
id: 7117
title: 'collection.Base: replace internal getCount() calls with count'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-27T00:28:59Z'
updatedAt: '2025-07-27T00:30:09Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7117'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-07-27T00:30:09Z'
---
# collection.Base: replace internal getCount() calls with count

**Reported by:** @tobiu on 2025-07-27

* `getCount()` is deprecated.
* we will continue to keep it for a while, but should not use it on our own.

