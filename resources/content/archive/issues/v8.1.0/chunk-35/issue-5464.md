---
id: 5464
title: 'Portal.view.home.parts.Helix: wheel listeners not always working when rendering initially'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2024-06-23T11:57:03Z'
updatedAt: '2024-06-23T12:38:11Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5464'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-06-23T12:37:49Z'
---
# Portal.view.home.parts.Helix: wheel listeners not always working when rendering initially

probably related to `component.Helix` itself. will look into it.

## Timeline

- 2024-06-23T11:57:03Z @tobiu added the `bug` label
- 2024-06-23T11:57:03Z @tobiu assigned to @tobiu
- 2024-06-23T12:37:10Z @tobiu referenced in commit `30b1ecd` - "Portal.view.home.parts.Helix: wheel listeners not always working when rendering initially #5464"
### @tobiu - 2024-06-23T12:37:49Z

it went down into `component.Base`, where a specific edge-case did not pass the promise resolver. fixed now.

- 2024-06-23T12:37:49Z @tobiu closed this issue

