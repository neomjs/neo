---
id: 1666
title: 'manager.Component: down() => support passing component instances'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-03-30T10:56:47Z'
updatedAt: '2021-03-30T10:57:52Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1666'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-03-30T10:57:52Z'
---
# manager.Component: down() => support passing component instances

It is faster, since we don't need to look  up the id to get a match, plus we can parse not constructed config objects as well.

## Timeline

- 2021-03-30T10:56:48Z @tobiu added the `enhancement` label
- 2021-03-30T10:56:48Z @tobiu assigned to @tobiu
- 2021-03-30T10:57:12Z @tobiu referenced in commit `3851d9e` - "manager.Component: down() => support passing component instances #1666"
- 2021-03-30T10:57:50Z @tobiu referenced in commit `da5d8fe` - "#1666 removed the testing log"
- 2021-03-30T10:57:53Z @tobiu closed this issue

