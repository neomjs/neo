---
id: 5727
title: 'Colors.view.ViewportController: destroy() => clear the setInterval() call'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-08-09T09:40:20Z'
updatedAt: '2024-08-09T09:40:56Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5727'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-08-09T09:40:56Z'
---
# Colors.view.ViewportController: destroy() => clear the setInterval() call

when destroying the app, we must no longer frequently ask for new websocket data.

@mxmrtns 

## Timeline

- 2024-08-09T09:40:21Z @tobiu added the `enhancement` label
- 2024-08-09T09:40:21Z @tobiu assigned to @tobiu
- 2024-08-09T09:40:47Z @tobiu referenced in commit `b49bbc8` - "Colors.view.ViewportController: destroy() => clear the setInterval() call #5727"
- 2024-08-09T09:40:56Z @tobiu closed this issue

