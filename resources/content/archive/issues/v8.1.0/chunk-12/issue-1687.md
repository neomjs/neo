---
id: 1687
title: 'component.Base: destroy() => destroy the model instance, in case it does exist'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-03-31T15:51:47Z'
updatedAt: '2021-03-31T15:55:05Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1687'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-03-31T15:55:05Z'
---
# component.Base: destroy() => destroy the model instance, in case it does exist

the logic is not correct yet.

`removeBindings()` needs to get called on the parent model while a connected model needs to get destroyed.

## Timeline

- 2021-03-31T15:51:48Z @tobiu added the `enhancement` label
- 2021-03-31T15:51:48Z @tobiu assigned to @tobiu
- 2021-03-31T15:55:01Z @tobiu referenced in commit `fb75970` - "component.Base: destroy() => destroy the model instance, in case it does exist #1687"
- 2021-03-31T15:55:05Z @tobiu closed this issue

