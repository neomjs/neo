---
id: 3133
title: 'buildThemes: sass.render() is deprecated'
state: CLOSED
labels:
  - enhancement
  - help wanted
  - stale
assignees: []
createdAt: '2022-06-07T12:26:23Z'
updatedAt: '2024-09-15T02:35:51Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3133'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-15T02:35:50Z'
---
# buildThemes: sass.render() is deprecated

the new methods are `compile()` and for our use case `compileString()`:
https://sass-lang.com/documentation/js-api/modules#compileString

i did a quick test and unfortunately the API and way of using the new method differ. in detail: passing the data as the 1st param is an easy change, but afterwards the internal import URLs inside .scss files break. me might need to add a custom importFn to handle our use case.

help on this one is appreciated.

## Timeline

- 2022-06-07T12:26:23Z @tobiu added the `enhancement` label
- 2022-06-07T12:26:23Z @tobiu added the `help wanted` label
### @github-actions - 2024-08-31T02:25:51Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-31T02:25:51Z @github-actions added the `stale` label
### @github-actions - 2024-09-15T02:35:50Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-15T02:35:50Z @github-actions closed this issue

