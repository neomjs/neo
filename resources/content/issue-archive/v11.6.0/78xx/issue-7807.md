---
id: 7807
title: 'data.Store: load() => ignore the node.js env for webpack'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2025-11-19T13:00:39Z'
updatedAt: '2025-11-19T13:01:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7807'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-19T13:01:16Z'
---
# data.Store: load() => ignore the node.js env for webpack

```
const { readFile } = await import('fs/promises');
```

is outside the client-side scope, so webpack must ignore it for dist versions.

```
const { readFile } = await import(/* webpackIgnore: true */ 'fs/promises');
```

## Timeline

- 2025-11-19T13:00:39Z @tobiu assigned to @tobiu
- 2025-11-19T13:00:41Z @tobiu added the `bug` label
- 2025-11-19T13:01:10Z @tobiu referenced in commit `85c82d5` - "data.Store: load() => ignore the node.js env for webpack #7807"
- 2025-11-19T13:01:16Z @tobiu closed this issue

