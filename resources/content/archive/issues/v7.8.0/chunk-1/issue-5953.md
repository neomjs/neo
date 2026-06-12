---
id: 5953
title: 'Portal.view.learn.ContentComponent: not re-rendering child components on re-mounting'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2024-09-21T14:46:37Z'
updatedAt: '2024-09-21T19:07:17Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5953'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-21T19:07:17Z'
---
# Portal.view.learn.ContentComponent: not re-rendering child components on re-mounting

@maxrahder @rwaters:

Navigating within the learning section works fine. However, in case we navigate from "Learn" to "Blog", "Home" etc., the learning view will get unmounted. Navigating back to "Learn" => the last active page and LivePreviews are completely missing.

## Timeline

- 2024-09-21T14:46:37Z @tobiu added the `bug` label
- 2024-09-21T14:46:37Z @tobiu assigned to @tobiu
- 2024-09-21T19:07:10Z @tobiu referenced in commit `47e33bd` - "Portal.view.learn.ContentComponent: not re-rendering child components on re-mounting #5953"
- 2024-09-21T19:07:17Z @tobiu closed this issue

