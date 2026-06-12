---
id: 751
title: 'Realworld App: new timing issues preventing the User API to load'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2020-06-18T20:43:46Z'
updatedAt: '2020-06-18T20:45:02Z'
githubUrl: 'https://github.com/neomjs/neo/issues/751'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-06-18T20:45:02Z'
---
# Realworld App: new timing issues preventing the User API to load

RealWorld.api.Base:

onAppRendered() can trigger Base.on("ready") while it is already ready (so the event won't fire).

## Timeline

- 2020-06-18T20:43:47Z @tobiu added the `bug` label
- 2020-06-18T20:43:47Z @tobiu assigned to @tobiu
- 2020-06-18T20:44:06Z @tobiu referenced in commit `73b0017` - "Realworld App: new timing issues preventing the User API to load #751"
- 2020-06-18T20:44:31Z @tobiu referenced in commit `88be1bc` - "#751 removed the testing log"
- 2020-06-18T20:45:02Z @tobiu closed this issue

