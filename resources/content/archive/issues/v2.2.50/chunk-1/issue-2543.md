---
id: 2543
title: 'selection.Model: items => items_'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2021-06-29T21:39:14Z'
updatedAt: '2021-06-29T21:39:48Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2543'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-06-29T21:39:48Z'
---
# selection.Model: items => items_

the config was storing an array which got shared on prototype level.

a `beforeGet()` assignment can fix this.

## Timeline

- 2021-06-29T21:39:14Z @tobiu added the `bug` label
- 2021-06-29T21:39:14Z @tobiu assigned to @tobiu
- 2021-06-29T21:39:40Z @tobiu referenced in commit `4c53dc6` - "selection.Model: items => items_ #2543"
- 2021-06-29T21:39:49Z @tobiu closed this issue

