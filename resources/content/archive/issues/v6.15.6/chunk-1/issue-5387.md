---
id: 5387
title: 'core.Observable: removeListener() => add support for the 1-liner syntax'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2024-04-11T16:08:35Z'
updatedAt: '2024-04-11T16:24:48Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5387'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-04-11T16:21:09Z'
---
# core.Observable: removeListener() => add support for the 1-liner syntax

this already is in use inside our codebase. e.g.:
`HashHistory.un('change', me.onHashChange, me);`

## Timeline

- 2024-04-11T16:08:35Z @tobiu added the `bug` label
- 2024-04-11T16:08:36Z @tobiu assigned to @tobiu
- 2024-04-11T16:21:02Z @tobiu referenced in commit `31e5f4a` - "core.Observable: removeListener() => add support for the 1-liner syntax #5387"
- 2024-04-11T16:21:09Z @tobiu closed this issue

