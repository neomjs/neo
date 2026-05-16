---
id: 1818
title: 'model.Component: move the resolveBindings() logic directly into parseConfig()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-04-19T12:24:24Z'
updatedAt: '2021-04-19T12:25:14Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1818'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-04-19T12:25:14Z'
---
# model.Component: move the resolveBindings() logic directly into parseConfig()

since components now register themselves, we can get rid of the `resolveBindings()` call entirely.

we can also remove the `onAfterConstructed()` call inside `component.Base`.

## Timeline

- 2021-04-19T12:24:24Z @tobiu added the `enhancement` label
- 2021-04-19T12:24:24Z @tobiu assigned to @tobiu
- 2021-04-19T12:24:45Z @tobiu referenced in commit `f4c7d61` - "model.Component: move the resolveBindings() logic directly into parseConfig() #1818"
- 2021-04-19T12:25:14Z @tobiu closed this issue

