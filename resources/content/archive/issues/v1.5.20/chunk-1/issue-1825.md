---
id: 1825
title: change binding formatters from strings to functions
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-04-20T10:21:55Z'
updatedAt: '2021-04-20T10:24:19Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1825'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-04-20T10:24:19Z'
---
# change binding formatters from strings to functions

This is a rather big topic. Actually a breaking change, so this would be neo v2.

To get rid of our only know security issue:
`fn = new Function('data', 'return `' + formatter + '`;');`

we should replace binding formatter strings with functions.

While we can not convert a template literal to a string, we can definitely use `myFunction.toString()`.

## Timeline

- 2021-04-20T10:21:55Z @tobiu added the `enhancement` label
- 2021-04-20T10:21:55Z @tobiu assigned to @tobiu
- 2021-04-20T10:22:18Z @tobiu referenced in commit `b9afdb7` - "change binding formatters from strings to functions #1825"
- 2021-04-20T10:24:19Z @tobiu closed this issue

