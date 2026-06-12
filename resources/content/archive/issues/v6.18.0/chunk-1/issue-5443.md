---
id: 5443
title: 'examples.component.helix.MainContainer: add a view controller'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-06-22T16:24:49Z'
updatedAt: '2024-06-22T16:58:47Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5443'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-06-22T16:58:47Z'
---
# examples.component.helix.MainContainer: add a view controller

this is a pretty old example and has inline logic which relies on the helix having a static id.

since we now want to use it inside the portal app LivePreview, we need to re-generate it as needed => we need dynamic ids and a better separation of concerns.

the good news is that there is already a better version out there:
Covid.view.HelixContainer
Covid.view.HelixContainerController

## Timeline

- 2024-06-22T16:24:49Z @tobiu added the `enhancement` label
- 2024-06-22T16:24:49Z @tobiu assigned to @tobiu
- 2024-06-22T16:29:28Z @tobiu referenced in commit `886074e` - "#5443 examples.component.helix.MainContainer => examples.component.helix.Viewport"
- 2024-06-22T16:34:36Z @tobiu referenced in commit `82f48c1` - "#5443 examples.component.helix.ViewportController"
- 2024-06-22T16:58:43Z @tobiu referenced in commit `ba6949d` - "examples.component.helix.MainContainer: add a view controller #5443"
- 2024-06-22T16:58:47Z @tobiu closed this issue

