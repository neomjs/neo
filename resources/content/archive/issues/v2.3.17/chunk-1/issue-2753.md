---
id: 2753
title: 'Webpack: "Automatic publicPath is not supported in this browser"'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2021-11-08T16:51:14Z'
updatedAt: '2021-11-08T16:52:35Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2753'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-11-08T16:51:52Z'
---
# Webpack: "Automatic publicPath is not supported in this browser"

There seems to be a pretty recent change (last couple of months) which now breaks the realworld demo app. I did not double-check other demos in prod.

maybe Tobias @sokra has an idea.

Adding `publicPath: ''` to the output config object for main threads already seems to fix it.

*Edit* The error did occur in Chrome.

## Timeline

- 2021-11-08T16:51:14Z @tobiu added the `bug` label
- 2021-11-08T16:51:14Z @tobiu assigned to @tobiu
- 2021-11-08T16:51:39Z @tobiu referenced in commit `6c92065` - "Webpack: "Automatic publicPath is not supported in this browser" #2753"
- 2021-11-08T16:51:52Z @tobiu closed this issue

