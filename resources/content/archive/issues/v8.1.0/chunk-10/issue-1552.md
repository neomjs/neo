---
id: 1552
title: 'worker.Base: registerApp()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-03-21T12:45:12Z'
updatedAt: '2021-03-21T12:45:47Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1552'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-03-21T12:45:47Z'
---
# worker.Base: registerApp()

move the method into worker.App, since it can only get triggered when creating an app (controller.Application instance).

## Timeline

- 2021-03-21T12:45:12Z @tobiu added the `enhancement` label
- 2021-03-21T12:45:12Z @tobiu assigned to @tobiu
- 2021-03-21T12:45:37Z @tobiu referenced in commit `b6a574a` - "worker.Base: registerApp() #1552"
- 2021-03-21T12:45:47Z @tobiu closed this issue

