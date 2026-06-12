---
id: 1853
title: 'Neo.mjs: general config getter => delete the config symbol'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-04-22T16:19:51Z'
updatedAt: '2021-04-22T16:21:41Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1853'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-04-22T16:21:41Z'
---
# Neo.mjs: general config getter => delete the config symbol

i think we can safely delete the config symbol inside the getter, since the symbol is consumed already.
this might speed the parsing up a little bit.

## Timeline

- 2021-04-22T16:19:51Z @tobiu added the `enhancement` label
- 2021-04-22T16:19:51Z @tobiu assigned to @tobiu
- 2021-04-22T16:20:10Z @tobiu referenced in commit `deebb32` - "Neo.mjs: general config getter => delete the config symbol #1853"
- 2021-04-22T16:21:41Z @tobiu closed this issue

