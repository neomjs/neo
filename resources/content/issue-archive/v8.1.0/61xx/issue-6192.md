---
id: 6192
title: 'grid.View: createRow() => completely exclude non-visible cells from the vdom'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-01-08T11:02:55Z'
updatedAt: '2025-01-08T11:03:18Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6192'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-01-08T11:03:18Z'
---
# grid.View: createRow() => completely exclude non-visible cells from the vdom

the first idea was to keep a `{removeDom: true}` flag to keep the internal structure in place.

however, in case there are big amounts of columns, this would increase the size of the worker messages to check for vdom updates quite a lot => not needed.

## Timeline

- 2025-01-08T11:02:55Z @tobiu added the `enhancement` label
- 2025-01-08T11:02:55Z @tobiu assigned to @tobiu
- 2025-01-08T11:03:12Z @tobiu referenced in commit `4d7320c` - "grid.View: createRow() => completely exclude non-visible cells from the vdom #6192"
- 2025-01-08T11:03:19Z @tobiu closed this issue

