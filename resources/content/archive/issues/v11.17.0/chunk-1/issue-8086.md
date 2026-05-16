---
id: 8086
title: '[Tests] Add unit tests for Draggable SortZone'
state: CLOSED
labels:
  - ai
  - testing
assignees:
  - tobiu
createdAt: '2025-12-11T02:29:48Z'
updatedAt: '2025-12-11T02:31:33Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8086'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-11T02:31:33Z'
---
# [Tests] Add unit tests for Draggable SortZone

Add a new unit test suite for `Neo.draggable.container.SortZone` using Playwright.

**Coverage:**
1. Initialization with mixed content (sortable and non-sortable items).
2. Sorting logic:
   - Dragging items from end to start.
   - Dragging items from start to end.
3. Correct index calculation when a `dragPlaceholder` is present.

This ensures the fix for #8054 is regression-tested and that mixed-content containers (like Toolbars with separators) remain stable.

## Timeline

- 2025-12-11T02:29:49Z @tobiu added the `ai` label
- 2025-12-11T02:29:49Z @tobiu added the `testing` label
- 2025-12-11T02:30:51Z @tobiu assigned to @tobiu
- 2025-12-11T02:31:27Z @tobiu referenced in commit `c77c6ff` - "[Tests] Add unit tests for Draggable SortZone #8086"
- 2025-12-11T02:31:33Z @tobiu closed this issue

