---
id: 5868
title: 'button.Base: polish the ripple effect styling'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-09-10T21:05:56Z'
updatedAt: '2024-09-10T21:10:09Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5868'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-10T21:10:09Z'
---
# button.Base: polish the ripple effect styling

i noticed 2 glitches inside the new theme:

1. the ripple wrapper needs to use the same border radius as the button
2. we need to add `left: 0` and `top: 0` to compensate for button paddings => to ensure the overall position is correct

@mxmrtns 

## Timeline

- 2024-09-10T21:05:56Z @tobiu added the `enhancement` label
- 2024-09-10T21:05:56Z @tobiu assigned to @tobiu
- 2024-09-10T21:06:24Z @tobiu referenced in commit `31ec0ea` - "button.Base: polish the ripple effect styling #5868"
### @tobiu - 2024-09-10T21:10:09Z

https://github.com/user-attachments/assets/38bc9cfc-7959-4275-9493-e5318532e403



- 2024-09-10T21:10:09Z @tobiu closed this issue

