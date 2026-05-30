---
id: 3454
title: domListeners => remove empty array assignments
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2022-09-26T20:00:12Z'
updatedAt: '2022-09-27T21:07:09Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3454'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-09-27T21:07:09Z'
---
# domListeners => remove empty array assignments

there are still spots with the following code:
`domListeners = me.domListeners || []`

can get simplified to:
`domListeners = me.domListeners`

## Timeline

- 2022-09-26T20:00:12Z @tobiu added the `enhancement` label
- 2022-09-26T20:00:13Z @tobiu assigned to @tobiu
### @tobiu - 2022-09-27T21:07:09Z

fixed through #3458

- 2022-09-27T21:07:09Z @tobiu closed this issue

