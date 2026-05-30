---
id: 1810
title: 'RealWorld.api.Base: the core.Base listener does get assigned 4x'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2021-04-17T14:43:11Z'
updatedAt: '2021-04-17T15:36:00Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1810'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-04-17T15:35:59Z'
---
# RealWorld.api.Base: the core.Base listener does get assigned 4x

this is definitely new:
![Screenshot 2021-04-17 at 16 41 53](https://user-images.githubusercontent.com/1177434/115116815-f68b3e80-9f9b-11eb-8569-1768a274e8cb.png)

looking into it!

## Timeline

- 2021-04-17T14:43:11Z @tobiu added the `bug` label
- 2021-04-17T14:43:11Z @tobiu assigned to @tobiu
- 2021-04-17T15:34:31Z @tobiu referenced in commit `fcd1b0d` - "RealWorld.api.Base: the core.Base listener does get assigned 4x #1810"
### @tobiu - 2021-04-17T15:35:59Z

this one was tricky to spot:
The api.Base class was using a custom method called `onAfterConstructed()`.
At a later point, I added this method as an official class lifecycle method.
The result was a collision => double execution.

- 2021-04-17T15:35:59Z @tobiu closed this issue

