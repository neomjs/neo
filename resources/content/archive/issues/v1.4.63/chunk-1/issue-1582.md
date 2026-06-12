---
id: 1582
title: 'core.Base: isConstructed config'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-03-25T15:48:01Z'
updatedAt: '2021-03-25T16:57:25Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1582'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-03-25T16:57:25Z'
---
# core.Base: isConstructed config

defaults to false.

we need a hook inside Neo.create() to change it to true.

afterSetIsConstructed needs to fire an event.

## Timeline

- 2021-03-25T15:48:01Z @tobiu added the `enhancement` label
- 2021-03-25T15:48:01Z @tobiu assigned to @tobiu
### @tobiu - 2021-03-25T16:54:19Z

ok, this is impossible, since we can not use configs with a trailing underscore inside core.Base.

instead, we can use `isConstructed` and trigger a new onAfterConstructed method inside Neo.create().

- 2021-03-25T16:54:36Z @tobiu changed title from **core.Base: isContructed_ config** to **core.Base: isContructed config**
- 2021-03-25T16:56:30Z @tobiu referenced in commit `a0edf94` - "core.Base: isConstructed config #1582"
- 2021-03-25T16:56:56Z @tobiu changed title from **core.Base: isContructed config** to **core.Base: isConstructed config**
- 2021-03-25T16:57:25Z @tobiu closed this issue

