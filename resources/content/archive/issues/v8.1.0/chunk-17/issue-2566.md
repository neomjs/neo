---
id: 2566
title: 'vdom.Helper: remove the setTextContent deltas'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-07-06T16:55:56Z'
updatedAt: '2021-07-06T16:56:23Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2566'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-07-06T16:56:23Z'
---
# vdom.Helper: remove the setTextContent deltas

those deltas make sense for the table use case, but this one is covered with `main.addon.CloneNodes` now.

the deltas have side effects not comparing oldItems for movements inside the vdom tree, which is affecting the calendar drag&drop.

on the long run, I will create two modes for delta updates: one which ignores movements and is faster and the current greedy version.

## Timeline

- 2021-07-06T16:55:56Z @tobiu added the `enhancement` label
- 2021-07-06T16:55:56Z @tobiu assigned to @tobiu
- 2021-07-06T16:56:21Z @tobiu referenced in commit `b5146ce` - "vdom.Helper: remove the setTextContent deltas #2566"
- 2021-07-06T16:56:23Z @tobiu closed this issue

