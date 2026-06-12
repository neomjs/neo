---
id: 3907
title: 'main.addon.GoogleMaps: loadApi() => add a dummy callback'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2023-01-19T13:32:19Z'
updatedAt: '2023-01-19T13:33:26Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3907'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-01-19T13:33:26Z'
---
# main.addon.GoogleMaps: loadApi() => add a dummy callback

even though we are loading the script via JavaScript and have our own Promise based callback, the API got stricter and now enforces an url based callback. otherwise it does still work, but fires an error.

## Timeline

- 2023-01-19T13:32:20Z @tobiu added the `enhancement` label
- 2023-01-19T13:32:20Z @tobiu assigned to @tobiu
- 2023-01-19T13:33:12Z @tobiu referenced in commit `2ba85d1` - "main.addon.GoogleMaps: loadApi() => add a dummy callback #3907"
- 2023-01-19T13:33:26Z @tobiu closed this issue

