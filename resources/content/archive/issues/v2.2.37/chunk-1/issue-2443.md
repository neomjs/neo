---
id: 2443
title: Spreading default values
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-06-21T16:51:16Z'
updatedAt: '2021-06-21T17:11:46Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2443'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-06-21T17:11:46Z'
---
# Spreading default values

I am using the spread operator a lot:

`let foo = {a:1, ...fooDefaults || {}}`

I just noticed that it is a valid operation to spread null:

`let foo = {a:1, ...null}`

so we can reduce the code base a bit removing the `|| {}` parts.

## Timeline

- 2021-06-21T16:51:16Z @tobiu added the `enhancement` label
- 2021-06-21T16:51:16Z @tobiu assigned to @tobiu
- 2021-06-21T17:11:26Z @tobiu referenced in commit `c9ad74a` - "Spreading default values #2443"
- 2021-06-21T17:11:46Z @tobiu closed this issue

