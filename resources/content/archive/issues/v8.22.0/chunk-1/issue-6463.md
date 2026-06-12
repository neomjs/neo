---
id: 6463
title: 'grid.View: scrollByRows() => switch to main.DomAccess.scrollTo()'
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2025-02-18T15:29:55Z'
updatedAt: '2025-02-18T16:13:53Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6463'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-02-18T16:13:52Z'
---
# grid.View: scrollByRows() => switch to main.DomAccess.scrollTo()

* Using `main.DomAccess.scrollBy()` works fine when navigating with arrow keys
* However, if you press the `home` or `end` keys or just scroll with the mouse, the next arrow key will just scroll by one row, instead of to the target location


## Timeline

- 2025-02-18T15:29:55Z @tobiu added the `enhancement` label
- 2025-02-18T16:13:39Z @tobiu referenced in commit `fa83755` - "grid.View: scrollByRows() => switch to main.DomAccess.scrollTo() #6463"
### @tobiu - 2025-02-18T16:13:52Z

https://github.com/user-attachments/assets/ea982168-1308-4ac6-a378-534a648694b2

- 2025-02-18T16:13:52Z @tobiu closed this issue

