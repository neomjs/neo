---
id: 5630
title: 'Portal.view.home.MainContainer: activePartsId'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-07-27T12:30:03Z'
updatedAt: '2024-07-27T12:30:37Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5630'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-07-27T12:30:37Z'
---
# Portal.view.home.MainContainer: activePartsId

Let us store the currently intersecting child container and inside their activation logic then check, if it is still the visible item.

Rationale: if you scroll from the landing page over the helix to the colors app container, you do not want the helix container to switch to the `code.LivePreview` preview tab (lazy-loading & mounting the app).

## Timeline

- 2024-07-27T12:30:03Z @tobiu added the `enhancement` label
- 2024-07-27T12:30:04Z @tobiu assigned to @tobiu
- 2024-07-27T12:30:20Z @tobiu referenced in commit `379d590` - "Portal.view.home.MainContainer: activePartsId #5630"
- 2024-07-27T12:30:37Z @tobiu closed this issue

