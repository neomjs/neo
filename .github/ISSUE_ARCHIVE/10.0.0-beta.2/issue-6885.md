---
id: 6885
title: >-
  component.MagicMoveText: afterSetText() => remove the custom blank char
  replacement
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-06-27T15:39:26Z'
updatedAt: '2025-06-27T15:39:58Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6885'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-06-27T15:39:58Z'
---
# component.MagicMoveText: afterSetText() => remove the custom blank char replacement

**Reported by:** @tobiu on 2025-06-27

* using `textContent`, it is no longer required.
* we can also remove the top-level `text` config (now defined inside `component.Base`)

