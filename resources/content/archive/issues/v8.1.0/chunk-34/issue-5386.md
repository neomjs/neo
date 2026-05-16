---
id: 5386
title: Neo.isObject() => make the logic more specific
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-04-10T15:31:31Z'
updatedAt: '2024-04-10T15:32:13Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5386'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-04-10T15:32:13Z'
---
# Neo.isObject() => make the logic more specific

i just ran into an edge case where `Neo.isObject()` returned true for `new Intl.DateTimeFormat()`.

classes extending object should be considered as a false return value.

## Timeline

- 2024-04-10T15:31:31Z @tobiu added the `enhancement` label
- 2024-04-10T15:31:31Z @tobiu assigned to @tobiu
- 2024-04-10T15:32:10Z @tobiu referenced in commit `1f794ae` - "Neo.isObject() => make the logic more specific #5386"
- 2024-04-10T15:32:14Z @tobiu closed this issue

