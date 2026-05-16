---
id: 5659
title: portal-home-progress - move the CSS to a better fitting file
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-08-01T09:16:21Z'
updatedAt: '2024-08-01T09:19:56Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5659'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-08-01T09:19:56Z'
---
# portal-home-progress - move the CSS to a better fitting file

@Dinkh I really don't understand why the CSS for the progress indicator ended up inside `HeaderToolbar.scss`, since it is not related to this file in any way.

Right now, the indicator is a direct child of `Portal.view.home.MainContainer`, so I will move the styling there.

If the indicator shall get used inside other main views later on, we can move it up into the `Viewport.scss`.

@mxmrtns 

## Timeline

- 2024-08-01T09:16:21Z @tobiu added the `enhancement` label
- 2024-08-01T09:16:22Z @tobiu assigned to @tobiu
- 2024-08-01T09:19:46Z @tobiu referenced in commit `9770637` - "portal-home-progress - move the CSS to a better fitting file #5659"
- 2024-08-01T09:19:56Z @tobiu closed this issue

