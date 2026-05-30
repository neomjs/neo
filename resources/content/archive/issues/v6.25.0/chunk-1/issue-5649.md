---
id: 5649
title: 'Portal.view.HeaderToolbar: limit the vertical social icons mode to the home route'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-07-31T09:22:48Z'
updatedAt: '2024-07-31T13:03:11Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5649'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-07-31T13:03:11Z'
---
# Portal.view.HeaderToolbar: limit the vertical social icons mode to the home route

* remove the responsive plugin from the header toolbar
* remove all scroll listeners except for the home route
* move the show / hide logic into the ViewportController

## Timeline

- 2024-07-31T09:22:48Z @tobiu added the `enhancement` label
- 2024-07-31T09:22:48Z @tobiu assigned to @tobiu
- 2024-07-31T09:23:07Z @tobiu referenced in commit `b8e504c` - "Portal.view.HeaderToolbar: limit the vertical social icons mode to the home route #5649"
- 2024-07-31T09:23:18Z @tobiu closed this issue
### @tobiu - 2024-07-31T13:00:34Z

did not fully get it right. adding the hide transition as well now when switching routes

- 2024-07-31T13:00:34Z @tobiu reopened this issue
- 2024-07-31T13:03:05Z @tobiu referenced in commit `1511c41` - "Portal.view.HeaderToolbar: limit the vertical social icons mode to the home route #5649"
- 2024-07-31T13:03:11Z @tobiu closed this issue

