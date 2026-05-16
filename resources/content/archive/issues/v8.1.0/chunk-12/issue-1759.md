---
id: 1759
title: 'controller.Component: store references inside parseConfig()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-04-13T18:41:36Z'
updatedAt: '2021-04-13T18:51:48Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1759'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-04-13T18:51:48Z'
---
# controller.Component: store references inside parseConfig()

Since we now parse each component on its own, it is ensured that the component id already exists, so we can directly store refs (faster access on the first `getReference()` call.

## Timeline

- 2021-04-13T18:41:36Z @tobiu added the `enhancement` label
- 2021-04-13T18:41:36Z @tobiu assigned to @tobiu
- 2021-04-13T18:42:57Z @tobiu referenced in commit `93163fd` - "controller.Component: store references inside parseConfig() #1759"
- 2021-04-13T18:51:48Z @tobiu closed this issue

