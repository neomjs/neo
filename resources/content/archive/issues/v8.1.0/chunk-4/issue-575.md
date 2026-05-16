---
id: 575
title: 'Build Scripts: create a separate entry point for the vdom worker'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-05-21T09:34:35Z'
updatedAt: '2020-05-21T10:32:00Z'
githubUrl: 'https://github.com/neomjs/neo/issues/575'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-05-21T10:32:00Z'
---
# Build Scripts: create a separate entry point for the vdom worker

We want to add chunk splitting to the app worker, so we have to create separate entrypoints for the data & vdom workers to not mix chunks across different realms (threads).

## Timeline

- 2020-05-21T09:34:36Z @tobiu added the `enhancement` label
- 2020-05-21T09:34:36Z @tobiu assigned to @tobiu
- 2020-05-21T09:37:15Z @tobiu cross-referenced by #577
- 2020-05-21T10:22:14Z @tobiu referenced in commit `7254a27` - "#575 vdom worker dev build"
- 2020-05-21T10:27:41Z @tobiu referenced in commit `852b714` - "#575 vdom worker prod build"
- 2020-05-21T10:32:00Z @tobiu closed this issue

