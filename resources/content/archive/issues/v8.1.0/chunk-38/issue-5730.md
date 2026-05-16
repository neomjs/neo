---
id: 5730
title: 'code.LivePreview: Navigating to the source view should destroy the app, in case the preview view is not popped out'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-08-09T23:47:41Z'
updatedAt: '2024-08-09T23:47:59Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5730'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-08-09T23:47:59Z'
---
# code.LivePreview: Navigating to the source view should destroy the app, in case the preview view is not popped out

@maxrahder @mxmrtns @rwaters 

the logic so far was that navigating to the preview tab will destroy any existing content and then create the new one.

an example where this is a problem is the colors dashboard app: if we activate the 60 FPS socket connection and then switch back to the code view, the socket keeps pulling in more messages infinitely, until navigating to the preview view again.

to save memory & performance, we need to destroy any content when navigating back to the source view.

## Timeline

- 2024-08-09T23:47:41Z @tobiu added the `enhancement` label
- 2024-08-09T23:47:41Z @tobiu assigned to @tobiu
- 2024-08-09T23:47:55Z @tobiu referenced in commit `962defa` - "code.LivePreview: Navigating to the source view should destroy the app, in case the preview view is not popped out #5730"
- 2024-08-09T23:47:59Z @tobiu closed this issue

