---
id: 5624
title: 'layout.Cube: updateContainerSize() => sideZ value'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-07-25T21:31:53Z'
updatedAt: '2024-07-25T21:32:10Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5624'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-07-25T21:32:10Z'
---
# layout.Cube: updateContainerSize() => sideZ value

While using `Math.min(height, width)` is correct, rotating the cube to the top or bottom side looks odd when when the width is bigger than the height of the parent container.

Always using the width resolves this issue.

## Timeline

- 2024-07-25T21:31:53Z @tobiu added the `enhancement` label
- 2024-07-25T21:31:53Z @tobiu assigned to @tobiu
- 2024-07-25T21:32:07Z @tobiu referenced in commit `f2c010d` - "layout.Cube: updateContainerSize() => sideZ value #5624"
- 2024-07-25T21:32:10Z @tobiu closed this issue

