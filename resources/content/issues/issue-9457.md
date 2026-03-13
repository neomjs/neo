---
id: 9457
title: 'Grid: Implement Mathematical Column Layout Engine'
state: OPEN
labels:
  - enhancement
  - ai
  - grid
assignees:
  - tobiu
createdAt: '2026-03-13T10:26:32Z'
updatedAt: '2026-03-13T10:26:59Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9457'
author: tobiu
commentsCount: 0
parentIssue: 9456
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Grid: Implement Mathematical Column Layout Engine

This is a sub-task of Epic #9456 (Buffered Grid - High-Performance Locked Columns).

**Context:**
Currently, `grid.header.Toolbar#passSizeToBody` calculates column `x` positions by calling `getDomRect` on the header items.
This poses a problem for locked columns using CSS transforms (`transform: translateX`). `getDomRect` will return the *visually transformed* layout coordinates, breaking the logical representation of the Grid's layout state.

**Task:**
Refactor the column layout calculation in `GridContainer` / `HeaderToolbar` so that `columnPositions.x` is calculated mathematically.
* `Logical X` should equal the sum of the widths (including borders/margins) of all preceding columns in the `items` array.
* This entirely decouples logical `x` layout from visual CSS states and avoids the need for asynchronous `getDomRect` queries on individual header buttons, improving startup performance.

*Note: The `Container` width and `Toolbar` height/width still need to be measured once for container sizing.*

## Timeline

- 2026-03-13T10:26:50Z @tobiu added parent issue #9456
- 2026-03-13T10:26:52Z @tobiu added the `enhancement` label
- 2026-03-13T10:26:52Z @tobiu added the `grid` label
- 2026-03-13T10:26:52Z @tobiu added the `ai` label
- 2026-03-13T10:26:59Z @tobiu assigned to @tobiu

