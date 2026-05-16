---
id: 4231
title: 'layout.Flexbox: applyChildAttributes() => polish for FF'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2023-03-31T16:47:32Z'
updatedAt: '2023-03-31T16:50:36Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4231'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-03-31T16:50:36Z'
---
# layout.Flexbox: applyChildAttributes() => polish for FF

using `flex: 1` creates `1 1 0%`. chromium handles this in a smart way. unfortunately FF does not render it the same way.

i will convert values of 1 into '1 1 auto' to satisfy the different rendering in FF.

## Timeline

- 2023-03-31T16:47:32Z @tobiu added the `enhancement` label
- 2023-03-31T16:47:33Z @tobiu assigned to @tobiu
- 2023-03-31T16:50:04Z @tobiu referenced in commit `917d5ab` - "layout.Flexbox: applyChildAttributes() => polish for FF #4231"
- 2023-03-31T16:50:36Z @tobiu closed this issue

