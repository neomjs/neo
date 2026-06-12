---
id: 2370
title: 'model.Component: getPlainData()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-06-15T16:58:22Z'
updatedAt: '2021-06-15T17:00:54Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2370'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-06-15T17:00:54Z'
---
# model.Component: getPlainData()

the current approach:
```
return JSON.parse(JSON.stringify(this.data));
```

works well for only getting the values inside an object tree structure (excluding custom get() / set() based props), but it is not sufficient for non primitive values. E.g. dates get replaced by strings, which is bad.

## Timeline

- 2021-06-15T16:58:22Z @tobiu added the `enhancement` label
- 2021-06-15T16:58:23Z @tobiu assigned to @tobiu
- 2021-06-15T16:59:05Z @tobiu referenced in commit `84f4178` - "model.Component: getPlainData() #2370"
- 2021-06-15T17:00:54Z @tobiu closed this issue

