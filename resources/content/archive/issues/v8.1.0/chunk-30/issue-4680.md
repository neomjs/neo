---
id: 4680
title: 'core.Base: parseItemConfigs() => add a null check'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2023-08-09T09:21:51Z'
updatedAt: '2023-08-09T09:56:02Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4680'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-08-09T09:56:02Z'
---
# core.Base: parseItemConfigs() => add a null check

unfortunately, this method will also parse static class fields. having a field like:
```
static myField = ['item1', 'item2', null]
```

can break the logic.

## Timeline

- 2023-08-09T09:21:51Z @tobiu added the `bug` label
- 2023-08-09T09:21:52Z @tobiu assigned to @tobiu
- 2023-08-09T09:55:38Z @tobiu referenced in commit `986642b` - "core.Base: parseItemConfigs() => add a null check #4680"
- 2023-08-09T09:56:02Z @tobiu closed this issue

