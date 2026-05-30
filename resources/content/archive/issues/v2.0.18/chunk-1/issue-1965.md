---
id: 1965
title: 'worker.App: onRegisterNeoConfig()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-05-06T09:11:07Z'
updatedAt: '2021-05-06T09:12:41Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1965'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-05-06T09:12:41Z'
---
# worker.App: onRegisterNeoConfig()

we need this entry point to load the theme map as early as possible, since it ensures that `Neo.config.useCssVars` is set.

## Timeline

- 2021-05-06T09:11:07Z @tobiu added the `enhancement` label
- 2021-05-06T09:11:07Z @tobiu assigned to @tobiu
- 2021-05-06T09:11:27Z @tobiu referenced in commit `32667fd` - "worker.App: onRegisterNeoConfig() #1965"
- 2021-05-06T09:12:41Z @tobiu closed this issue

