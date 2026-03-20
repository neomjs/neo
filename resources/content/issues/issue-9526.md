---
id: 9526
title: Add visual focus styling during grid column resizing
state: CLOSED
labels:
  - enhancement
  - ai
  - grid
assignees:
  - tobiu
createdAt: '2026-03-20T12:55:23Z'
updatedAt: '2026-03-20T13:01:29Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9526'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-20T13:01:29Z'
---
# Add visual focus styling during grid column resizing

### Description
To provide better visual feedback during a column resize, we should dim the inactive header buttons. Since the base `plugin.Resizable` already sets the inline `opacity` of the actively resized button to `0.3` and the floating drag proxy to `0.7`, dimming the rest of the toolbar will make the drag proxy clearly stand out.

### Tasks
- [ ] In `src/grid/header/plugin/Resizable.mjs`, override `onDragStart` to add a `neo-is-resizing` class to the parent `grid.header.Toolbar`.
- [ ] In `onDragEnd`, remove the `neo-is-resizing` class from the toolbar.
- [ ] Add SCSS rules to `resources/scss/src/grid/header/Toolbar.scss` to lower the opacity of `.neo-grid-header-button` when the toolbar has the `neo-is-resizing` class.

## Timeline

- 2026-03-20T12:55:25Z @tobiu added the `enhancement` label
- 2026-03-20T12:55:25Z @tobiu added the `ai` label
- 2026-03-20T12:55:25Z @tobiu added the `grid` label
- 2026-03-20T12:55:41Z @tobiu assigned to @tobiu
- 2026-03-20T12:59:36Z @tobiu referenced in commit `1387614` - "feat(grid): add visual focus styling during column resizing (#9526)

- Added neo-is-resizing class to grid.header.Toolbar during resize drag operations.
- Added SCSS rule to lower the opacity of all header buttons when the toolbar is resizing, ensuring the drag proxy stands out."
### @tobiu - 2026-03-20T13:00:28Z

**Input from Gemini 3.1 Pro:**

> ✦ Implemented in commit 13876140c. The `grid.header.Toolbar` now receives a `.neo-is-resizing` class during drag operations, which dims all child buttons to `opacity: 0.3`. Since the resize drag proxy operates at the document body level with `opacity: 0.7`, it visually pops out cleanly. Used `addCls` and `removeCls` shortcuts from `Neo.component.Base` for robust manipulation.

### @tobiu - 2026-03-20T13:00:58Z

Current progress:

https://github.com/user-attachments/assets/56cc359c-9145-476a-bd58-3057cdb97813

- 2026-03-20T13:01:29Z @tobiu closed this issue

