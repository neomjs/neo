---
id: 1475
title: webpack.config.worker.js => add support for dynamic imports
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-12-03T22:06:21Z'
updatedAt: '2020-12-03T22:06:55Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1475'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-12-03T22:06:55Z'
---
# webpack.config.worker.js => add support for dynamic imports

the data & vdom threads are not using dynamic imports at this point.

however, since they could do it in the future, let us scope split chunks in advance.

```
chunkFilename: `chunks/${env.worker}/[id].js`,
```

## Timeline

- 2020-12-03T22:06:21Z @tobiu added the `enhancement` label
- 2020-12-03T22:06:21Z @tobiu assigned to @tobiu
- 2020-12-03T22:06:47Z @tobiu referenced in commit `709715e` - "webpack.config.worker.js => add support for dynamic imports #1475"
- 2020-12-03T22:06:55Z @tobiu closed this issue

