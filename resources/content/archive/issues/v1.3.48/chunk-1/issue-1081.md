---
id: 1081
title: 'container.Base: destroy() enhancement'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-08-15T19:57:43Z'
updatedAt: '2020-08-15T20:00:57Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1081'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-08-15T20:00:57Z'
---
# container.Base: destroy() enhancement

destroy() should call destroy() for each child components with updateParentVdom: false.

the main component (container) should use the real value.

## Timeline

- 2020-08-15T19:57:43Z @tobiu added the `enhancement` label
- 2020-08-15T19:57:43Z @tobiu assigned to @tobiu
- 2020-08-15T20:00:54Z @tobiu referenced in commit `41adca9` - "container.Base: destroy() enhancement #1081"
- 2020-08-15T20:00:57Z @tobiu closed this issue

