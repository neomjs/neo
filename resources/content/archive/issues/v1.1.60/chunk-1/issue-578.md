---
id: 578
title: 'Build Scripts: webpack.config.worker.js'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-05-21T10:41:04Z'
updatedAt: '2020-05-21T10:50:30Z'
githubUrl: 'https://github.com/neomjs/neo/issues/578'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-05-21T10:50:30Z'
---
# Build Scripts: webpack.config.worker.js

the webpack configs for the data & vdom workers are almost the same, so we can group them into a new file and pass an env var containing the target worker.

the builds themselves have to stay separate.

## Timeline

- 2020-05-21T10:41:04Z @tobiu added the `enhancement` label
- 2020-05-21T10:41:05Z @tobiu assigned to @tobiu
- 2020-05-21T10:46:27Z @tobiu referenced in commit `557b40a` - "#578 webpack.config.worker: dev build"
- 2020-05-21T10:50:20Z @tobiu referenced in commit `9deb219` - "#578 webpack.config.worker: prod build"
- 2020-05-21T10:50:30Z @tobiu closed this issue

