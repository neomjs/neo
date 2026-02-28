---
id: 8997
title: 'Feat: DevRank Selection Model Tab'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-05T09:29:46Z'
updatedAt: '2026-02-05T09:39:17Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8997'
author: tobiu
commentsCount: 1
parentIssue: 8930
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-05T09:39:17Z'
---
# Feat: DevRank Selection Model Tab

Implement a "Selection" tab in the DevRank ControlsContainer to allow users to dynamically switch between different grid selection models (Cell, Column, Row, etc.), matching the functionality of the Big Data Grid example.

**Tasks:**
- Import selection models and Radio field in `apps/devrank/view/ControlsContainer.mjs`.
- Add "Selection" tab to the TabContainer.
- Implement `onSelectionModelChange` handler.
- Verify functionality.

## Timeline

- 2026-02-05T09:29:47Z @tobiu added the `enhancement` label
- 2026-02-05T09:29:48Z @tobiu added the `ai` label
- 2026-02-05T09:31:30Z @tobiu added parent issue #8930
- 2026-02-05T09:38:33Z @tobiu referenced in commit `25a5158` - "feat: Add Selection Model tab to DevRank controls (#8997)"
- 2026-02-05T09:38:50Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-05T09:38:59Z

**Input from Gemini 3 Pro:**

> ✦ Implemented the "Selection" tab in `DevRank.view.ControlsContainer`.
> - Added imports for `Neo.selection.grid` models, `Neo.form.field.Radio`, and `Neo.tab.Container`.
> - Added a new tab item with Radio buttons for switching selection models (Cell, Column, Row, etc.).
> - Implemented `onSelectionModelChange` handler to update `grid.body.selectionModel`.
> 
> Verification: The UI now matches the Big Data Grid example's selection controls.

- 2026-02-05T09:39:17Z @tobiu closed this issue

