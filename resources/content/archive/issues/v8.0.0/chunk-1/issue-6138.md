---
id: 6138
title: 'core.Base: timeout() => typo'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2024-12-14T12:53:42Z'
updatedAt: '2024-12-14T12:55:12Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6138'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-12-14T12:55:12Z'
---
# core.Base: timeout() => typo

```
timeoutIds.splice(timeoutIds.indexOf(timeoutId, 1))
```

should obviously be:
```
timeoutIds.splice(timeoutIds.indexOf(timeoutId), 1)
```

while `indexOf()` does have a 2nd optional param `fromIndex`, the goal was to pass the `1` as a 2nd param to splice to remove the found item.

## Timeline

- 2024-12-14T12:53:42Z @tobiu added the `bug` label
- 2024-12-14T12:53:42Z @tobiu assigned to @tobiu
- 2024-12-14T12:55:06Z @tobiu referenced in commit `282f474` - "core.Base: timeout() => typo #6138"
- 2024-12-14T12:55:12Z @tobiu closed this issue

