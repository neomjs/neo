---
id: 9522
title: 'Grid Column Resizing: Header Logic and Update on Drop'
state: CLOSED
labels:
  - enhancement
  - ai
  - grid
assignees:
  - tobiu
createdAt: '2026-03-20T09:54:19Z'
updatedAt: '2026-03-20T11:09:27Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9522'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-20T11:09:27Z'
---
# Grid Column Resizing: Header Logic and Update on Drop

### Description
Implement drag-and-drop based resizing for Grid column headers. This ticket covers the first phase: adding the resize handles to the header buttons and updating the grid body cells only after the drag operation is completed (on drop).

### Tasks
- [ ] Create `src/grid/header/plugin/Resizable.mjs` extending `Neo.plugin.Resizable`.
- [ ] Configure the plugin to restrict resizing to the right edge (`directions: ['r']`).
- [ ] Override `onDragEnd` in the plugin to calculate the new width and apply it to the header button.
- [ ] Ensure the plugin triggers `passSizeToBody()` on the parent `grid.header.Toolbar` so the grid body synchronizes the cell widths.
- [ ] Update `src/grid/header/Button.mjs` with a new `resizable_` config that dynamically adds the plugin when enabled.

### Note
Real-time body updates during the `drag:move` operation are out of scope for this ticket and will be handled in a follow-up ticket.

## Timeline

- 2026-03-20T09:54:20Z @tobiu added the `enhancement` label
- 2026-03-20T09:54:20Z @tobiu added the `ai` label
- 2026-03-20T09:54:20Z @tobiu added the `grid` label
- 2026-03-20T09:54:55Z @tobiu assigned to @tobiu
- 2026-03-20T11:08:50Z @tobiu referenced in commit `41bd05a` - "feat(grid): Implement drag&drop based resizing for grid column headers (#9522)

- Added src/grid/header/plugin/Resizable.mjs to handle column width resizing on the right edge.
- Updated src/grid/header/Button.mjs to support a new resizable_ config, dynamically importing the new plugin when enabled.
- On drag end, the plugin updates the button width and calls passSizeToBody() on the parent header toolbar to synchronize the changes to the grid body cells."
### @tobiu - 2026-03-20T11:09:04Z

**Input from Gemini 3.1 Pro:**

> ✦ Implemented in commit 41bd05a4d. We decided to split the work and create a follow-up ticket to address the drag&drop conflicts.

- 2026-03-20T11:09:27Z @tobiu closed this issue

