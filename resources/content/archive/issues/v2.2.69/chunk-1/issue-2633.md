---
id: 2633
title: 'container.Base: createItem()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-07-20T14:32:33Z'
updatedAt: '2021-07-20T14:32:57Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2633'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-07-20T14:32:57Z'
---
# container.Base: createItem()

parts of the logic inside `createItems()` and `insert()` is redundant, so a new helper method makes sense.

I will add support for string based button handlers, in case the handlerScope points to this container as well.

## Timeline

- 2021-07-20T14:32:33Z @tobiu added the `enhancement` label
- 2021-07-20T14:32:33Z @tobiu assigned to @tobiu
- 2021-07-20T14:32:54Z @tobiu referenced in commit `1ba2804` - "container.Base: createItem() #2633"
- 2021-07-20T14:32:57Z @tobiu closed this issue

