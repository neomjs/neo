---
id: 6372
title: 'Portal.view.learn: moving a live preview into a popup sometimes renders the cmp into the same window again'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2025-02-03T22:51:51Z'
updatedAt: '2025-02-03T22:52:50Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6372'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-02-03T22:52:50Z'
---
# Portal.view.learn: moving a live preview into a popup sometimes renders the cmp into the same window again

![Image](https://github.com/user-attachments/assets/ed99c529-5b1d-4af3-9574-40c2deb78026)

This is a funny one. first thought was it is related to the vdom update changes. it is not.

`component.Base`: `render()`will check for non-loaded theme files. in this case, the mounting will get delayed until `themeFilesLoaded` triggers. This can happen at any arbitrary point and by then parent containers have already taken care of this part.

Long story short: when the callback gets triggered, we need to check if the cmp is already mounted. 

## Timeline

- 2025-02-03T22:51:52Z @tobiu added the `bug` label
- 2025-02-03T22:51:52Z @tobiu assigned to @tobiu
- 2025-02-03T22:52:42Z @tobiu referenced in commit `24660d9` - "Portal.view.learn: moving a live preview into a popup sometimes renders the cmp into the same window again #6372"
- 2025-02-03T22:52:51Z @tobiu closed this issue

