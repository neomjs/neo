---
id: 80
title: 'component.Base: promiseBulkConfigUpdate'
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2019-11-21T10:08:03Z'
updatedAt: '2019-11-28T10:20:29Z'
githubUrl: 'https://github.com/neomjs/neo/issues/80'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2019-11-28T10:20:28Z'
---
# component.Base: promiseBulkConfigUpdate

create a promise based wrapper for bulkConfigUpdate.

the idea is when iterating over multiple components like here:
https://github.com/neomjs/neo/blob/dev/apps/realworld/views/HomeComponent.mjs

to e.g. use promiseAll and get a callback option (here: update the HomeCmp vdom once the list item components are done).

## Timeline

- 2019-11-21T10:08:03Z @tobiu added the `enhancement` label
- 2019-11-28T10:20:13Z @tobiu referenced in commit `f6d1f22` - "component.Base: promiseBulkConfigUpdate #80"
### @tobiu - 2019-11-28T10:20:28Z

done.

- 2019-11-28T10:20:29Z @tobiu closed this issue

