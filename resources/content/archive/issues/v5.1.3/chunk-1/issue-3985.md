---
id: 3985
title: 'buildScripts/addConfig: addHook() => method position'
state: CLOSED
labels:
  - bug
assignees: []
createdAt: '2023-02-04T16:49:41Z'
updatedAt: '2023-02-06T14:24:19Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3985'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-02-06T14:24:19Z'
---
# buildScripts/addConfig: addHook() => method position

new methods no longer get sorted chronologically. this is related to the v5 changes.

```
for (; i < len; i++) {
    if (contentArray[i].includes('}}')) {
        break;
    }
}
```

`'}}'` no longer exists, so we need a different starting point for the first method.

## Timeline

- 2023-02-04T16:49:41Z @tobiu added the `bug` label
- 2023-02-06T14:24:16Z @tobiu referenced in commit `1d74063` - "buildScripts/addConfig: addHook() => method position #3985"
- 2023-02-06T14:24:19Z @tobiu closed this issue

