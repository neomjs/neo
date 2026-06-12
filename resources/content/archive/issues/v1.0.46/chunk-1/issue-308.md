---
id: 308
title: 'Neo.data.Store: set data'
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2020-03-17T22:16:14Z'
updatedAt: '2020-03-17T22:21:00Z'
githubUrl: 'https://github.com/neomjs/neo/issues/308'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-03-17T22:20:59Z'
---
# Neo.data.Store: set data

assigning new data to a store should not convert the given objects into records, but cloned versions of them => e.g. in case you load an API and want to assign the result to multiple stores.

obviously it would be better performance-wise to always do it manually if needed, but this might be confusing for new users.

## Timeline

- 2020-03-17T22:16:14Z @tobiu added the `enhancement` label
- 2020-03-17T22:18:56Z @tobiu referenced in commit `809df0a` - "Neo.data.Store: set data #308"
### @tobiu - 2020-03-17T22:20:59Z

done

- 2020-03-17T22:20:59Z @tobiu closed this issue

