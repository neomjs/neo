---
id: 2285
title: 'plugin.Resizable: addNode() => add a check if the target node exists'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-06-06T11:12:33Z'
updatedAt: '2021-06-06T11:12:59Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2285'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-06-06T11:12:59Z'
---
# plugin.Resizable: addNode() => add a check if the target node exists

super fast resize OPs (almost a click) can trigger drag:end before `addNode()` does get called.

## Timeline

- 2021-06-06T11:12:33Z @tobiu added the `enhancement` label
- 2021-06-06T11:12:33Z @tobiu assigned to @tobiu
- 2021-06-06T11:12:55Z @tobiu referenced in commit `2b76bb7` - "plugin.Resizable: addNode() => add a check if the target node exists #2285"
- 2021-06-06T11:12:59Z @tobiu closed this issue

