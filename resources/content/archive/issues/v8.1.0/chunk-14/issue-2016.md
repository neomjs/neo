---
id: 2016
title: 'Covid.view.MainContainerController: addStoreItems() check if the active tab exists'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2021-05-10T10:58:49Z'
updatedAt: '2021-05-10T10:59:36Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2016'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-05-10T10:59:36Z'
---
# Covid.view.MainContainerController: addStoreItems() check if the active tab exists

the ajax call can arrive before the active tab is created.

we can just add a check, the data will get applied later anyway.

## Timeline

- 2021-05-10T10:58:49Z @tobiu added the `bug` label
- 2021-05-10T10:58:49Z @tobiu assigned to @tobiu
- 2021-05-10T10:59:34Z @tobiu referenced in commit `15446ae` - "Covid.view.MainContainerController: addStoreItems() check if the active tab exists #2016"
- 2021-05-10T10:59:36Z @tobiu closed this issue

