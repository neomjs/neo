---
id: 393
title: Using webpack to build neo.mjs
state: CLOSED
labels:
  - enhancement
  - help wanted
  - discussion
assignees: []
createdAt: '2020-03-28T21:51:04Z'
updatedAt: '2020-09-21T11:38:47Z'
githubUrl: 'https://github.com/neomjs/neo/issues/393'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-09-21T11:38:47Z'
---
# Using webpack to build neo.mjs

just tried once more to switch our webpack based builds from target node to web and it still breaks since there are window references (don't exist inside the worker scope).

opened an issue on the webpack repo which we should track:
https://github.com/webpack/webpack/issues/10630

using target: node does work as long as we are not using dynamic imports. this however is something i really would love to do => lazy loading modules as needed.

it works perfectly fine for the dev mode, but there is no point in case we would need to create a separate version just for enabling webpack to handle it.

## Timeline

- 2020-03-28T21:51:04Z @tobiu added the `enhancement` label
- 2020-03-28T21:51:04Z @tobiu added the `help wanted` label
- 2020-03-28T21:51:04Z @tobiu added the `discussion` label
### @tobiu - 2020-09-21T11:38:47Z

resolved already.

- 2020-09-21T11:38:47Z @tobiu closed this issue

