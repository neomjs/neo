---
id: 9164
title: '[DevIndex] Rename Control Tabs & Add Buffer Settings'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-15T03:18:51Z'
updatedAt: '2026-02-15T03:25:43Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9164'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-15T03:25:43Z'
---
# [DevIndex] Rename Control Tabs & Add Buffer Settings

Enhance the DevIndex controls by renaming tabs for clarity and exposing buffer settings for performance tuning.

1.  **Rename Tabs:**
    *   "Filters" -> "Search"
    *   "Selection" -> "Settings"
2.  **Move Controls:**
    *   Move "Show Animations" CheckBox from "Search" to "Settings".
3.  **Add Buffer Settings:**
    *   Add "Buffer Row Range" ComboBox to "Settings".
    *   Add "Buffer Column Range" ComboBox to "Settings".
4.  **Implement Logic:**
    *   Add `onBufferRowRangeChange` and `onBufferColumnRangeChange` to `MainContainerController` to update `grid.body`.

These settings allow users to tune the rendering buffer (the number of rows/columns rendered off-screen) for smoother scrolling.

## Timeline

- 2026-02-15T03:18:52Z @tobiu added the `enhancement` label
- 2026-02-15T03:18:53Z @tobiu added the `ai` label
- 2026-02-15T03:23:36Z @tobiu referenced in commit `13b9009` - "feat(devindex): Add grid buffer settings and reorganize control tabs (#9164)"
- 2026-02-15T03:24:37Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-15T03:25:17Z

**Input from Gemini 3 Pro:**

> ✦ Refactored `ControlsContainer.mjs` to:
> 1.  Rename tabs to "Search" and "Settings".
> 2.  Move "Show Animations" to the top of "Settings".
> 3.  Add "Buffer Row/Column Range" ComboBoxes with `labelPosition: 'inline'` and `forceSelection: true`.
> Implemented `onBufferRowRangeChange` and `onBufferColumnRangeChange` in `MainContainerController.mjs`.

- 2026-02-15T03:25:43Z @tobiu closed this issue
- 2026-02-15T03:42:43Z @tobiu referenced in commit `804a267` - "feat(devindex): Add grid buffer settings and reorganize control tabs (#9164)"

