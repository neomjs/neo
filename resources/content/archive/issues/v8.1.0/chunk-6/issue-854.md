---
id: 854
title: 'list.Base: onStoreLoad()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-07-01T10:49:21Z'
updatedAt: '2020-07-01T11:01:06Z'
githubUrl: 'https://github.com/neomjs/neo/issues/854'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-07-01T11:01:06Z'
---
# list.Base: onStoreLoad()

add a check if the view is rendering & not mounted.

if so, delay the createItems() logic until the view is mounted.

## Timeline

- 2020-07-01T10:49:21Z @tobiu added the `enhancement` label
- 2020-07-01T10:49:22Z @tobiu assigned to @tobiu
- 2020-07-01T11:00:55Z @tobiu referenced in commit `af6de10` - "list.Base: onStoreLoad() #854"
- 2020-07-01T11:01:06Z @tobiu closed this issue

