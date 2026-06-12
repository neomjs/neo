---
id: 1800
title: 'webpack-dev-server: switch to v4.0.0-beta.2'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-04-16T12:16:46Z'
updatedAt: '2021-04-16T12:18:29Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1800'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-04-16T12:18:29Z'
---
# webpack-dev-server: switch to v4.0.0-beta.2

with the switch to dart-sass we got one less dependency of the `fsevents v1.2.13`package.

one last dependency remains for the `webpack-dev-server v3.x` package.

this one is using an outdated version of the `chokidar` package:
https://www.npmjs.com/package/chokidar (version 2 instead of 3)

chokidar v2.x relies on fsevents v1.

the good news: `webpack-dev-server v4.0.0-beta.2` is using chokidar v3, so with switching to the new version we can remove our optional fsevents dependency again.

## Timeline

- 2021-04-16T12:16:46Z @tobiu added the `enhancement` label
- 2021-04-16T12:16:46Z @tobiu assigned to @tobiu
- 2021-04-16T12:18:11Z @tobiu referenced in commit `8c0af79` - "webpack-dev-server: switch to v4.0.0-beta.2 #1800"
- 2021-04-16T12:18:29Z @tobiu closed this issue

