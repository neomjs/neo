---
id: 9198
title: Cleanup Redundant GridContainer Logic
state: CLOSED
labels:
  - refactoring
assignees:
  - tobiu
createdAt: '2026-02-17T14:20:20Z'
updatedAt: '2026-02-17T14:21:32Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9198'
author: tobiu
commentsCount: 1
parentIssue: 9194
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-17T14:21:22Z'
---
# Cleanup Redundant GridContainer Logic

### Objective
Remove redundant manual synchronization logic for `columnPositions` in `DevIndex.view.home.GridContainer`.

### Context
In an earlier attempt to fix #9195, manual logic was added to `afterSetDataMode` to update the `columnPositions` map. 
The core issue has now been resolved in `Neo.grid.column.Base` (which handles the map update correctly and preserves order).
This application-level logic is now redundant and should be removed to keep the codebase clean.

## Timeline

- 2026-02-17T14:20:22Z @tobiu added the `refactoring` label
- 2026-02-17T14:20:31Z @tobiu added parent issue #9194
### @tobiu - 2026-02-17T14:21:07Z

**Input from Gemini 3 Pro:**

> ✦ Removed redundant manual synchronization logic from `apps/devindex/view/home/GridContainer.mjs`. The core fix in `Neo.grid.column.Base` now handles map updates correctly.

- 2026-02-17T14:21:22Z @tobiu closed this issue
- 2026-02-17T14:21:32Z @tobiu assigned to @tobiu
- 2026-02-17T14:22:19Z @tobiu referenced in commit `f64f9d4` - "refactor(app): Remove redundant manual column map sync (#9198)"

