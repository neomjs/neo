---
id: 1739
title: 'model.Component: stores config'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-04-09T17:42:17Z'
updatedAt: '2021-04-09T20:09:07Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1739'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-04-09T20:09:07Z'
---
# model.Component: stores config

view models are supposed to store data.

data.Store contains data, so it should be possible to create store instances inside a vm.

type: object.

each key is a store instance name to which we can bind to.

## Timeline

- 2021-04-09T17:42:17Z @tobiu added the `enhancement` label
- 2021-04-09T17:42:17Z @tobiu assigned to @tobiu
- 2021-04-09T17:43:17Z @tobiu referenced in commit `cd9edf6` - "model.Component: stores config #1739"
- 2021-04-09T17:45:14Z @tobiu referenced in commit `52e3eaa` - "#1739 afterSetStores() => no logic yet"
- 2021-04-09T18:47:08Z @tobiu referenced in commit `f0cd536` - "#1739 model.Component: beforeSetStores()"
- 2021-04-09T20:04:34Z @tobiu referenced in commit `dc3da87` - "#1739 adjusted parseBindings() to to resolve a store config. adjusted resolveBindings() to ignore this one."
### @tobiu - 2021-04-09T20:09:07Z

The first PoC is working now. I will create new follow up tickets to further improve it.

- 2021-04-09T20:09:07Z @tobiu closed this issue

