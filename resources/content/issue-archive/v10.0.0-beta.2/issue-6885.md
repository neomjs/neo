---
id: 6885
title: 'component.MagicMoveText: afterSetText() => remove the custom blank char replacement'
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
blockedBy: []
blocking: []
closedAt: '2025-06-27T15:39:58Z'
---
# component.MagicMoveText: afterSetText() => remove the custom blank char replacement

* using `textContent`, it is no longer required.
* we can also remove the top-level `text` config (now defined inside `component.Base`)

## Timeline

- 2025-06-27T15:39:26Z @tobiu assigned to @tobiu
- 2025-06-27T15:39:27Z @tobiu added the `enhancement` label
- 2025-06-27T15:39:49Z @tobiu referenced in commit `8b176d5` - "component.MagicMoveText: afterSetText() => remove the custom blank char replacement #6885"
- 2025-06-27T15:39:58Z @tobiu closed this issue

