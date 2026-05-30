---
id: 5642
title: 'Portal.view.HeaderToolbar: separate bar => triggers fadeIn / fadeOut animations for scrolling child nodes inside Home'
state: CLOSED
labels:
  - bug
assignees:
  - Dinkh
createdAt: '2024-07-29T06:30:03Z'
updatedAt: '2024-07-29T18:57:01Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5642'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-07-29T18:57:01Z'
---
# Portal.view.HeaderToolbar: separate bar => triggers fadeIn / fadeOut animations for scrolling child nodes inside Home

https://github.com/user-attachments/assets/1e06b077-222a-4852-a050-aed483e87188

Obviously the separate-bar should only show / hide when scrolling the main container.


## Timeline

- 2024-07-29T06:30:03Z @tobiu added the `bug` label
- 2024-07-29T06:30:04Z @tobiu assigned to @Dinkh
- 2024-07-29T18:56:03Z @Dinkh referenced in commit `0aba075` - "#5642 Fixed that the global scroll event is captured, by limiting it to the correct target"
### @Dinkh - 2024-07-29T18:57:01Z

Fixed.
The problem is, that the domListener for scroll captures any component inside the MainContainer, instead of checking for the correct target.

- 2024-07-29T18:57:01Z @Dinkh closed this issue

