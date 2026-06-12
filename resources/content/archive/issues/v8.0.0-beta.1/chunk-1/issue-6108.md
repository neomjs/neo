---
id: 6108
title: 'component.Base: afterSetIsLoading() => simplify the initial check'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-11-14T16:32:08Z'
updatedAt: '2024-11-14T16:34:17Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6108'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-11-14T16:34:17Z'
---
# component.Base: afterSetIsLoading() => simplify the initial check

boolean algebra:
```
if (!(value === false && oldValue === undefined)) {
```

=>

```
if (value || oldValue !== undefined) {
```

## Timeline

- 2024-11-14T16:32:08Z @tobiu added the `enhancement` label
- 2024-11-14T16:32:08Z @tobiu assigned to @tobiu
- 2024-11-14T16:34:13Z @tobiu referenced in commit `3ff104f` - "component.Base: afterSetIsLoading() => simplify the initial check #6108"
- 2024-11-14T16:34:17Z @tobiu closed this issue

