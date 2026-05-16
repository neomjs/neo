---
id: 3534
title: buildScripts/adjustVersion
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2022-10-06T13:49:37Z'
updatedAt: '2022-11-12T12:51:00Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3534'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-11-12T12:51:00Z'
---
# buildScripts/adjustVersion

create a small script which grabs the neo version inside the package.json and then adds it into the default config and the service worker. afterwards the SW can check if an app with a new framework version connects and if so purge the cache.

this helps with e.g. the online examples => deploying a new version can cause errors in case you get outdated split chunks.

the script should get added into build-all.

## Timeline

- 2022-10-06T13:49:38Z @tobiu added the `enhancement` label
### @tobiu - 2022-11-12T12:51:00Z

duplicate item => #3550 

- 2022-11-12T12:51:00Z @tobiu closed this issue

