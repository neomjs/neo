---
id: 3776
title: 'component.Base: beforeSetCls() => always apply the base cls'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2023-01-04T16:41:13Z'
updatedAt: '2023-01-04T16:41:47Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3776'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-01-04T16:41:47Z'
---
# component.Base: beforeSetCls() => always apply the base cls

i ran into some edge cases where the `cls` value got resetted => the `baseCs` got lost.

a little bit slower, but it feels safer to ensure it is always present.

## Timeline

- 2023-01-04T16:41:13Z @tobiu added the `bug` label
- 2023-01-04T16:41:13Z @tobiu assigned to @tobiu
- 2023-01-04T16:41:41Z @tobiu referenced in commit `bd35008` - "component.Base: beforeSetCls() => always apply the base cls #3776"
- 2023-01-04T16:41:47Z @tobiu closed this issue

