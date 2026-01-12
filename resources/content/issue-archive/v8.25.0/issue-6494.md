---
id: 6494
title: grid.ScrollManager
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-02-26T10:44:22Z'
updatedAt: '2025-02-26T12:58:25Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6494'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-02-26T12:58:25Z'
---
# grid.ScrollManager

Right now, the scrolling logic is scattered inside `grid.Container` & `grid.View`. It should be at a central spot instead.

## Timeline

- 2025-02-26T10:44:22Z @tobiu added the `enhancement` label
- 2025-02-26T10:44:22Z @tobiu assigned to @tobiu
- 2025-02-26T10:44:54Z @tobiu referenced in commit `766f6d7` - "grid.ScrollManager #6494 base class"
- 2025-02-26T11:51:34Z @tobiu referenced in commit `685727b` - "grid.ScrollManager #6494 creating the instance inside grid.Container"
- 2025-02-26T12:05:07Z @tobiu referenced in commit `4b42a62` - "#6494 grid.ScrollManager: onContainerScroll()"
- 2025-02-26T12:06:55Z @tobiu referenced in commit `af9ceb5` - "#6494 grid.ScrollManager: lastTouchY"
- 2025-02-26T12:19:28Z @tobiu referenced in commit `c16b128` - "#6494 grid.ScrollManager: onTouchCancel(), onTouchEnd(), onViewScroll() WIP"
- 2025-02-26T12:28:10Z @tobiu referenced in commit `2d7b433` - "#6494 grid.ScrollManager: touchMoveOwner class field"
- 2025-02-26T12:45:41Z @tobiu referenced in commit `590a3f9` - "#6494 grid.ScrollManager: simplifying onTouchCancel()"
- 2025-02-26T12:48:51Z @tobiu referenced in commit `14e3192` - "#6494 grid.ScrollManager: setting scrollLeft & scrollTop"
- 2025-02-26T12:55:49Z @tobiu referenced in commit `72db738` - "#6494 grid.ScrollManager: using scrollLeft & scrollTop"
- 2025-02-26T12:58:25Z @tobiu closed this issue

