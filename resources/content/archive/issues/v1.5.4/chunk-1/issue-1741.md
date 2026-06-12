---
id: 1741
title: 'model.Component: add support for models without using a data config'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-04-09T18:21:06Z'
updatedAt: '2021-04-09T18:24:20Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1741'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-04-09T18:24:20Z'
---
# model.Component: add support for models without using a data config

we did not need this before, since the only thing models were using was the data config.

now, with adding a stores config into the mix, the data config should be optional.

the class still triggers `createDataProperties()` resulting in an error.

looking into this now!

## Timeline

- 2021-04-09T18:21:06Z @tobiu added the `enhancement` label
- 2021-04-09T18:21:06Z @tobiu assigned to @tobiu
- 2021-04-09T18:24:17Z @tobiu referenced in commit `24a4ec3` - "model.Component: add support for models without using a data config #1741"
- 2021-04-09T18:24:20Z @tobiu closed this issue

