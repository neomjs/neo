---
id: 442
title: 'Neo.worker.App: onLoadApplication() & onRemoteRegistered()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-04-07T11:22:00Z'
updatedAt: '2020-05-01T17:25:54Z'
githubUrl: 'https://github.com/neomjs/neo/issues/442'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-05-01T17:25:54Z'
---
# Neo.worker.App: onLoadApplication() & onRemoteRegistered()

this was just a fast hack to manually check the registered remotes. obviously there has to be a more generic approach: main, data & vdom need to know when all of their remotes are registered and let the app worker know about this. once all 3 threads sent the ping call onLoadApplication().

should be a priority item.

## Timeline

- 2020-04-07T11:22:00Z @tobiu added the `enhancement` label
- 2020-05-01T16:07:16Z @tobiu assigned to @tobiu
### @tobiu - 2020-05-01T16:08:03Z

we now really need this for the new build processes => a no longer static amount of remotes for the main thread. looking into it.

- 2020-05-01T17:21:36Z @tobiu referenced in commit `ff8a88e` - "Neo.worker.App: onLoadApplication() & onRemoteRegistered() #442"
### @tobiu - 2020-05-01T17:25:54Z

should be fine now.

- 2020-05-01T17:25:54Z @tobiu closed this issue

