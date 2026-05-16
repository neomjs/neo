---
id: 3112
title: 'core.Observable: fire() => remove listeners for no longer valid scopes'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2022-05-27T16:34:44Z'
updatedAt: '2022-05-27T16:36:36Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3112'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-05-27T16:36:36Z'
---
# core.Observable: fire() => remove listeners for no longer valid scopes

more like a workaround. in theory, every event should get manually removed within custom `destroy()` implementations. since this is not always the case, this "helper" feature feels useful.

## Timeline

- 2022-05-27T16:34:44Z @tobiu added the `enhancement` label
- 2022-05-27T16:34:44Z @tobiu assigned to @tobiu
- 2022-05-27T16:35:51Z @tobiu referenced in commit `6f76a11` - "core.Observable: fire() => remove listeners for no longer valid scopes #3112"
- 2022-05-27T16:36:36Z @tobiu closed this issue

