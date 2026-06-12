---
id: 2730
title: 'model.Component: mergeConfig()'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2021-09-16T19:11:57Z'
updatedAt: '2021-09-16T19:12:28Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2730'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-09-16T19:12:28Z'
---
# model.Component: mergeConfig()

`Neo.merge(null, {a:1})` returns null.

Inside `model.Component` we use:
`Neo.merge(Neo.clone(this.constructor.config.data, true), config.data)`

in case we have inline models, this will destroy the data.

## Timeline

- 2021-09-16T19:11:57Z @tobiu added the `bug` label
- 2021-09-16T19:11:57Z @tobiu assigned to @tobiu
- 2021-09-16T19:12:22Z @tobiu referenced in commit `9ed7aa9` - "model.Component: mergeConfig() #2730"
- 2021-09-16T19:12:28Z @tobiu closed this issue

