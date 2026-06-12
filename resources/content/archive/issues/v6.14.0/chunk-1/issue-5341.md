---
id: 5341
title: 'Portal.view.learn.MainContainerModel: onDataPropertyChange() => logic to find the prev & next tree list items'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-03-15T13:29:03Z'
updatedAt: '2024-03-17T13:21:33Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5341'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-03-17T13:21:33Z'
---
# Portal.view.learn.MainContainerModel: onDataPropertyChange() => logic to find the prev & next tree list items

@mxmrtns @maxrahder 

checking for the closest item which does have content is not sufficient. we also need to exclude hidden items inside our json input. for this we also need to check the parent node chain (e.g. hiding a full chapter => folder is possible).

i will create a helper method to take care of it.

## Timeline

- 2024-03-15T13:29:03Z @tobiu added the `enhancement` label
- 2024-03-15T13:29:04Z @tobiu assigned to @tobiu
- 2024-03-17T13:20:53Z @tobiu referenced in commit `33e1aea` - "Portal.view.learn.MainContainerModel: onDataPropertyChange() => logic to find the prev & next tree list items #5341"
- 2024-03-17T13:21:33Z @tobiu closed this issue
- 2024-03-26T16:29:47Z @tobiu referenced in commit `1b38af8` - "Portal.view.learn.MainContainerModel: onDataPropertyChange() => logic to find the prev & next tree list items #5341"

