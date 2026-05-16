---
id: 576
title: 'Build Scripts: create a separate entry point for the data worker'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-05-21T09:35:22Z'
updatedAt: '2020-05-21T10:38:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/576'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-05-21T10:38:16Z'
---
# Build Scripts: create a separate entry point for the data worker

We want to add chunk splitting to the app worker, so we have to create separate entrypoints for the data & vdom workers to not mix chunks across different realms (threads).

## Timeline

- 2020-05-21T09:35:22Z @tobiu added the `enhancement` label
- 2020-05-21T09:35:22Z @tobiu assigned to @tobiu
- 2020-05-21T09:37:15Z @tobiu cross-referenced by #577
- 2020-05-21T10:34:04Z @tobiu referenced in commit `c76bf02` - "#576 data worker dev build"
- 2020-05-21T10:38:03Z @tobiu referenced in commit `e4962e2` - "#576 data worker prod build"
- 2020-05-21T10:38:16Z @tobiu closed this issue

