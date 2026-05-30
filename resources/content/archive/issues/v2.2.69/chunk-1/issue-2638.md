---
id: 2638
title: 'list.Component: switch to index based list item component ids'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-07-21T17:53:58Z'
updatedAt: '2021-07-21T17:55:55Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2638'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-07-21T17:55:55Z'
---
# list.Component: switch to index based list item component ids

the advantage is, that we can re-use existing component items more easily.

e.g. when removing items from the store, we won't get id collision, which would happen in case the components have record based ids.

## Timeline

- 2021-07-21T17:53:58Z @tobiu added the `enhancement` label
- 2021-07-21T17:53:58Z @tobiu assigned to @tobiu
- 2021-07-21T17:54:44Z @tobiu referenced in commit `bc90d81` - "list.Component: switch to index based list item component ids #2638"
- 2021-07-21T17:55:55Z @tobiu closed this issue

