---
id: 1796
title: add fsevents to the package.json optional dependencies
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-04-16T10:02:56Z'
updatedAt: '2021-04-16T10:20:46Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1796'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-04-16T10:04:34Z'
---
# add fsevents to the package.json optional dependencies

the neo.mjs project is not using  the `fsevents` package on its own.

however, `node-sass` needs it on macOS.

by default, macOS is using version 1.2.13 and this results in several errors:
https://www.npmjs.com/package/fsevents/v/1.0.0?activeTab=readme

"fsevents 1 will break on node v14+ and could be using insecure binaries. Upgrade to fsevents 2."

the build does still work, but it is definitely better to get rid of the mess.

as far as i know, linux does not use the package at all, so adding it as a real dependency would cause an error in this scope.

adding it as an optional dependency should do the trick.

tested it locally (deleting the node_modules folder) and running npm install.

## Timeline

- 2021-04-16T10:02:56Z @tobiu added the `enhancement` label
- 2021-04-16T10:02:56Z @tobiu assigned to @tobiu
- 2021-04-16T10:04:31Z @tobiu referenced in commit `0943cdc` - "add fsevents to the package.json optional dependencies #1796"
- 2021-04-16T10:04:34Z @tobiu closed this issue

