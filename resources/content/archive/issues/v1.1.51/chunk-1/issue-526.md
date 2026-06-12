---
id: 526
title: switch build dev & prod to target webworker
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-05-02T08:36:55Z'
updatedAt: '2020-05-02T08:53:41Z'
githubUrl: 'https://github.com/neomjs/neo/issues/526'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-05-02T08:53:41Z'
---
# switch build dev & prod to target webworker

now that the main thread got isolated for builds, we can try to switch target node to webworker. will need some test runs to ensure nothing breaks.

## Timeline

- 2020-05-02T08:36:55Z @tobiu added the `enhancement` label
- 2020-05-02T08:36:55Z @tobiu assigned to @tobiu
- 2020-05-02T08:43:42Z @tobiu referenced in commit `2beb977` - "#526 build development: webpack.config.js => target: "webworker""
- 2020-05-02T08:46:42Z @tobiu referenced in commit `1543624` - "#526 build development: webpack.config.myapps.js => target: "webworker""
- 2020-05-02T08:49:47Z @tobiu referenced in commit `6bb36d3` - "#526 build production: webpack.config.myapps.js => target: "webworker""
- 2020-05-02T08:51:13Z @tobiu referenced in commit `74f3ee3` - "#526 build production: webpack.config.js => target: "webworker""
- 2020-05-02T08:53:41Z @tobiu closed this issue

