---
id: 5536
title: 'Colors.view.ViewportController: updateTable() => honor delays of the Socket Connection'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-07-05T18:49:44Z'
updatedAt: '2024-07-05T18:50:03Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5536'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-07-05T18:50:03Z'
---
# Colors.view.ViewportController: updateTable() => honor delays of the Socket Connection

after changing the amount of table rows, it is not guaranteed, that the answer of the next socket call already has the right settings.

## Timeline

- 2024-07-05T18:49:44Z @tobiu added the `enhancement` label
- 2024-07-05T18:49:44Z @tobiu assigned to @tobiu
- 2024-07-05T18:50:00Z @tobiu referenced in commit `18f352e` - "Colors.view.ViewportController: updateTable() => honor delays of the Socket Connection #5536"
- 2024-07-05T18:50:03Z @tobiu closed this issue
- 2024-07-05T20:12:09Z @tobiu referenced in commit `f82ebe0` - "neo.mjs v6.18.3 => included the fix for https://github.com/neomjs/neo/issues/5536"

