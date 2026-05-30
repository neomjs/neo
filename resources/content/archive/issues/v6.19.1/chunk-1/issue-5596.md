---
id: 5596
title: 'component.DateSelector: broken inside the calendar widget => scroll & date click no longer working'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2024-07-20T17:53:13Z'
updatedAt: '2024-07-20T17:53:46Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5596'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-07-20T17:53:46Z'
---
# component.DateSelector: broken inside the calendar widget => scroll & date click no longer working

internally, the `triggerVdomUpdate()` callback gets lost within a chain of colliding parent updates.

this one will get resolved with the chunking of vdom trees epic (next major version).

as a quick win, we can just adjust the initial painting logic.

## Timeline

- 2024-07-20T17:53:13Z @tobiu added the `bug` label
- 2024-07-20T17:53:13Z @tobiu assigned to @tobiu
- 2024-07-20T17:53:42Z @tobiu referenced in commit `9f3c714` - "component.DateSelector: broken inside the calendar widget => scroll & date click no longer working #5596"
- 2024-07-20T17:53:46Z @tobiu closed this issue

