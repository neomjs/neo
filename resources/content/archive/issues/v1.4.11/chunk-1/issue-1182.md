---
id: 1182
title: Adjust the webpackExclude check for node_modules
state: CLOSED
labels:
  - enhancement
  - help wanted
assignees: []
createdAt: '2020-09-10T11:52:43Z'
updatedAt: '2020-09-17T00:38:52Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1182'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-09-17T00:38:51Z'
---
# Adjust the webpackExclude check for node_modules

as mentioned inside the last blog post, it should do the following:

1. When building the App Worker for the neo.mjs framework itself, we want split chunks for all possible Apps inside the apps and the examples folder
2. When using neo.mjs as a node module, we only want split chunks for our own Apps (and not the examples & apps included inside the neo.mjs node_module). This part still needs testing.
3. When building the Online Examples, we trigger the build on the neo.mjs node_module, in which case we do want to get the content (This part works fine).

There is definitely a conflict for 2 and 3. Not sure if we can resolve this using magic comments or if we should adjust the webpack.config scripts.

Open for ideas!

## Timeline

- 2020-09-10T11:52:43Z @tobiu added the `enhancement` label
- 2020-09-10T11:52:43Z @tobiu added the `help wanted` label
### @tobiu - 2020-09-17T00:38:51Z

resolved already.

- 2020-09-17T00:38:51Z @tobiu closed this issue

