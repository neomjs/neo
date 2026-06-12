---
id: 4671
title: 'component.Base: updateVdom() => set needsVdomUpdate to false before starting the roundtrip'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2023-08-08T17:14:21Z'
updatedAt: '2023-08-08T17:49:58Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4671'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-08-08T17:49:58Z'
---
# component.Base: updateVdom() => set needsVdomUpdate to false before starting the roundtrip

in theory, new changes could happen while the roundtrip is processing.

## Timeline

- 2023-08-08T17:14:21Z @tobiu added the `bug` label
- 2023-08-08T17:14:21Z @tobiu assigned to @tobiu
- 2023-08-08T17:45:41Z @tobiu referenced in commit `85bcd4a` - "component.Base: updateVdom() => set needsVdomUpdate to false before starting the roundtrip #4671"
- 2023-08-08T17:49:58Z @tobiu closed this issue

