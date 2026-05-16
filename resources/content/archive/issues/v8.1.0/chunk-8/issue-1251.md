---
id: 1251
title: 'controller.Component: onViewParsed() => ensure the method only gets triggered once'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-10-15T09:15:23Z'
updatedAt: '2020-10-15T09:15:49Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1251'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-10-15T09:15:49Z'
---
# controller.Component: onViewParsed() => ensure the method only gets triggered once

onViewConstructed() will call itself recursively, so we need to add a check to ensure onViewParsed() will only get called for the top level.

## Timeline

- 2020-10-15T09:15:23Z @tobiu added the `enhancement` label
- 2020-10-15T09:15:23Z @tobiu assigned to @tobiu
- 2020-10-15T09:15:49Z @tobiu referenced in commit `dd2746e` - "controller.Component: onViewParsed() => ensure the method only gets triggered once #1251"
- 2020-10-15T09:15:49Z @tobiu closed this issue

