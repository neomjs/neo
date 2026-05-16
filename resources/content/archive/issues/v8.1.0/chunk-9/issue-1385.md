---
id: 1385
title: Migrate to webpack version 5
state: CLOSED
labels:
  - enhancement
  - help wanted
  - good first issue
assignees: []
createdAt: '2020-11-04T12:31:55Z'
updatedAt: '2020-11-30T09:35:58Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1385'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-11-30T09:35:58Z'
---
# Migrate to webpack version 5

Since webpack 5 is stable now (no longer RC), we should migrate at some point soon-ish.

We need to adjust the related build scripts:
https://github.com/neomjs/neo/tree/dev/buildScripts/webpack

Plus double-check, if the external plugins we are using still work.

I am flagging the ticket as a "good first issue", since you can work on it without having knowledge about this framework.

I am also flagging it as "help wanted", since I am busy with polishing the new drag&drop implementation.

## Timeline

- 2020-11-04T12:31:55Z @tobiu added the `enhancement` label
- 2020-11-04T12:31:55Z @tobiu added the `help wanted` label
- 2020-11-04T12:31:55Z @tobiu added the `good first issue` label
### @h1b9b - 2020-11-28T19:03:13Z

Hello, As there is no breaking changes. I made a [PR](https://github.com/neomjs/neo/pull/1465) upgrading webpack to version 5.  

- 2020-11-30T09:35:58Z @tobiu closed this issue

