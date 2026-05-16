---
id: 8090
title: '[Refactor] Move Toolbar SortZone SCSS to container/SortZone.scss'
state: CLOSED
labels:
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-12-11T18:42:19Z'
updatedAt: '2025-12-11T18:45:26Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8090'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-11T18:45:26Z'
---
# [Refactor] Move Toolbar SortZone SCSS to container/SortZone.scss

1. Append the `.neo-toolbar.neo-is-dragging` CSS rule from `resources/scss/src/draggable/toolbar/SortZone.scss` to `resources/scss/src/draggable/container/SortZone.scss`.
2. Update the selector to target direct children: `.neo-toolbar.neo-is-dragging > .neo-button`.
3. Remove `resources/scss/src/draggable/toolbar/SortZone.scss`.

## Timeline

- 2025-12-11T18:42:20Z @tobiu added the `ai` label
- 2025-12-11T18:42:20Z @tobiu added the `refactoring` label
- 2025-12-11T18:44:59Z @tobiu assigned to @tobiu
- 2025-12-11T18:45:19Z @tobiu referenced in commit `9b942f5` - "[Refactor] Move Toolbar SortZone SCSS to container/SortZone.scss #8090"
- 2025-12-11T18:45:26Z @tobiu closed this issue

