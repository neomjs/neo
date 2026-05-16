---
id: 1707
title: 'worker.App: isUsingViewModels config'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-04-01T15:07:43Z'
updatedAt: '2021-04-01T15:08:14Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1707'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-04-01T15:08:14Z'
---
# worker.App: isUsingViewModels config

since now every component will trigger `getModel()`, it will parse up to the full parent component chain to find the closest view model.

this can be expensive, especially in case there are no view models at all.

since view models are supposed to be optional, we need to store a flag inside `worker.App` which defaults to false.

the `model.Component` ctor will set it to true.

`component.Base: getModel()` can then check for the flag and return null in case it equals false.

my first idea was to add the flag to `controller.Application` (apps), but this will cause issues in case you dynamically move a component tree from one app to another.

## Timeline

- 2021-04-01T15:07:43Z @tobiu added the `enhancement` label
- 2021-04-01T15:07:43Z @tobiu assigned to @tobiu
- 2021-04-01T15:08:10Z @tobiu referenced in commit `feb5bae` - "worker.App: isUsingViewModels config #1707"
- 2021-04-01T15:08:14Z @tobiu closed this issue

