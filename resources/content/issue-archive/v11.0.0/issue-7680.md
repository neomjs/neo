---
id: 7680
title: 'Calendar regression: raw data access in store without creating the record'
state: CLOSED
labels:
  - bug
  - ai
  - regression
assignees:
  - tobiu
createdAt: '2025-10-31T19:35:48Z'
updatedAt: '2025-10-31T19:55:04Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7680'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-31T19:55:04Z'
---
# Calendar regression: raw data access in store without creating the record

The calendar example was throwing a `TypeError: date.getFullYear is not a function`. This was caused by `Events.mjs#getDayRecords()` accessing `me.items[i]` directly, which returns a raw data object instead of a `Record` instance. The fix is to use `me.getAt(i)` to ensure the lazy record creation is triggered.

## Timeline

- 2025-10-31T19:35:49Z @tobiu added the `bug` label
- 2025-10-31T19:35:49Z @tobiu added the `ai` label
- 2025-10-31T19:36:49Z @tobiu assigned to @tobiu
- 2025-10-31T19:37:18Z @tobiu referenced in commit `5e47730` - "Calendar regression: raw data access in store without creating the record #7680"
- 2025-10-31T19:55:00Z @tobiu added the `regression` label
- 2025-10-31T19:55:04Z @tobiu closed this issue

