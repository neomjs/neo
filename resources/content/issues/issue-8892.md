---
id: 8892
title: Create Component Test for Grid Teleportation Artifacts
state: OPEN
labels:
  - ai
  - testing
  - regression
assignees: []
createdAt: '2026-01-27T12:03:23Z'
updatedAt: '2026-01-27T12:03:23Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8892'
author: tobiu
commentsCount: 0
parentIssue: 8891
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking:
  - '[ ] 8894 Restore Grid Stability (Fix/Revert Teleportation)'
---
# Create Component Test for Grid Teleportation Artifacts

Create a Playwright Component Test (`test/playwright/component/grid/Teleportation.spec.mjs`) that reproduces the visual corruption in `Neo.grid.Container` when using `Neo.grid.column.Component`.

**Requirements:**
- Instantiate a Grid with a Store and a Component Column.
- Programmatically scroll the grid to trigger row recycling.
- Assert that cell contents are correct and do not contain duplicate text nodes (e.g., "Stephanie ++Stephanie ++").
- Verify that the loading mask works correctly during rapid scrolling.

## Timeline

- 2026-01-27T12:03:24Z @tobiu added the `ai` label
- 2026-01-27T12:03:24Z @tobiu added the `testing` label
- 2026-01-27T12:03:25Z @tobiu added the `regression` label
- 2026-01-27T12:04:48Z @tobiu added parent issue #8891
- 2026-01-27T12:04:58Z @tobiu marked this issue as blocking #8894

