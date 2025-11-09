---
id: 7000
title: >-
  grid.Container: afterSetColumns() => fine-tune the condition, when
  header.Toolbar items need to get processed
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-09T15:17:38Z'
updatedAt: '2025-07-09T16:42:27Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7000'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-07-09T16:42:27Z'
---
# grid.Container: afterSetColumns() => fine-tune the condition, when header.Toolbar items need to get processed

**Reported by:** @tobiu on 2025-07-09

* `header.Toolbar#onConstructed` which triggers `createItems()` might happen before columns got defined at run-time
* We should honor this edge-case from a stability perspective.

