---
id: 1702
title: 'container.Base: insert() => trigger model.parseConfig() if needed'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-04-01T12:03:33Z'
updatedAt: '2021-04-01T12:04:30Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1702'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-04-01T12:04:30Z'
---
# container.Base: insert() => trigger model.parseConfig() if needed

In case we dynamically add items which do not have an own model, we need to parse the item config to resolve possible binding values.

## Timeline

- 2021-04-01T12:03:33Z @tobiu added the `enhancement` label
- 2021-04-01T12:03:33Z @tobiu assigned to @tobiu
- 2021-04-01T12:04:18Z @tobiu referenced in commit `78236c0` - "container.Base: insert() => trigger model.parseConfig() if needed #1702"
- 2021-04-01T12:04:30Z @tobiu closed this issue

