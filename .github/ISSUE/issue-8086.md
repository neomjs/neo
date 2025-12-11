---
id: 8086
title: '[Tests] Add unit tests for Draggable SortZone'
state: OPEN
labels:
  - ai
  - testing
assignees: []
createdAt: '2025-12-11T02:29:48Z'
updatedAt: '2025-12-11T02:29:48Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8086'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
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

## Activity Log

- 2025-12-11 @tobiu added the `ai` label
- 2025-12-11 @tobiu added the `testing` label

