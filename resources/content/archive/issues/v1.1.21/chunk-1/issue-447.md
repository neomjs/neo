---
id: 447
title: 'Neo.vdom.Helper: sort array'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-04-10T09:16:03Z'
updatedAt: '2020-04-10T10:11:14Z'
githubUrl: 'https://github.com/neomjs/neo/issues/447'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-04-10T10:11:14Z'
---
# Neo.vdom.Helper: sort array

well, kind of a mix between a feature request and a bug.

in case we sort the covid dashboard with 211 rows, we get an array of deltas to move each TR tag now. these deltas are ordered by their old index. either the deltas do not fit inside one RAF or something else is happening here, but the order is no longer correct when sorting.

looking into it (does not affect the online demos yet).

## Timeline

- 2020-04-10T09:16:03Z @tobiu added the `enhancement` label
- 2020-04-10T09:16:03Z @tobiu assigned to @tobiu
- 2020-04-10T09:43:23Z @tobiu referenced in commit `a3fe5a2` - "Neo.vdom.Helper: sort array #447"
- 2020-04-10T09:56:33Z @tobiu referenced in commit `3fe3b8a` - "Neo.vdom.Helper: sort array #447 => adjusted the siesta tests"
- 2020-04-10T10:11:14Z @tobiu closed this issue

