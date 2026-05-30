---
id: 4607
title: 'button.Base: menu config => render the menu off screen initially'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2023-07-31T12:39:47Z'
updatedAt: '2023-07-31T14:22:06Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4607'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-07-31T14:22:06Z'
---
# button.Base: menu config => render the menu off screen initially

the initial rendering will not have the correct position, since we need the painted menu width to calculate it.

since the repositioning can happen inside the next rendering frame, we should move menus outside the visible area, to avoid a "jumping" effect.

## Timeline

- 2023-07-31T12:39:47Z @tobiu added the `enhancement` label
- 2023-07-31T12:39:48Z @tobiu assigned to @tobiu
- 2023-07-31T14:21:54Z @tobiu referenced in commit `34e38a6` - "button.Base: menu config => render the menu off screen initially #4607"
- 2023-07-31T14:22:06Z @tobiu closed this issue

