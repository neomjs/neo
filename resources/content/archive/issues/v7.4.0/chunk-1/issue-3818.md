---
id: 3818
title: 'We need a way to make a buffered function call. '
state: CLOSED
labels:
  - enhancement
  - stale
assignees: []
createdAt: '2023-01-06T22:23:33Z'
updatedAt: '2024-09-14T02:26:14Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3818'
author: maxrahder
commentsCount: 4
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-14T02:26:14Z'
---
# We need a way to make a buffered function call. 

We need a Neo.Function.createBuffered() or Neo.Function.debounce()
https://css-tricks.com/debouncing-throttling-explained-examples/

Here's the lodash source. It's MIT, and if MIT is good for Neo I'd just copy their implementation, or make it easy to simply integrate lodash into the app worker.

https://github.com/lodash/lodash/blob/4.17.15/lodash.js#L10304

## Timeline

- 2023-01-06T22:23:33Z @maxrahder added the `enhancement` label
### @maxrahder - 2023-01-06T22:24:30Z

Having a way to specify this in a `listeners` config would also be very very handy.

### @maxrahder - 2023-01-06T22:40:46Z

A `bind` config option would be nice too. 

### @github-actions - 2024-08-30T02:27:14Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-30T02:27:14Z @github-actions added the `stale` label
### @github-actions - 2024-09-14T02:26:13Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-14T02:26:14Z @github-actions closed this issue

