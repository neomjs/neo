---
id: 6399
title: 'grid.Container: onScroll() => limit to logic to grid container events'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-02-07T14:53:06Z'
updatedAt: '2025-02-07T14:53:33Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6399'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-02-07T14:53:33Z'
---
# grid.Container: onScroll() => limit to logic to grid container events

* After adding `grid.Scrollbar`, we now have 2 dom nodes creating scroll events
* It is crucial that `grid.Container` ignores the new scroller events
* Not just from a performance perspective, but it would destroy the `columnPositions`

## Timeline

- 2025-02-07T14:53:06Z @tobiu added the `enhancement` label
- 2025-02-07T14:53:06Z @tobiu assigned to @tobiu
- 2025-02-07T14:53:24Z @tobiu referenced in commit `7c01fdb` - "grid.Container: onScroll() => limit to logic to grid container events #6399"
- 2025-02-07T14:53:33Z @tobiu closed this issue

