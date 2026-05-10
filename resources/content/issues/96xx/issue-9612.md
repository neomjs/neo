---
id: 9612
title: 'Grid Multi-Body: Scrollbar Refactoring and Vertical Restoration'
state: CLOSED
labels:
  - enhancement
  - ai
  - grid
assignees:
  - tobiu
createdAt: '2026-03-31T14:25:26Z'
updatedAt: '2026-03-31T14:52:48Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9612'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-31T14:52:48Z'
---
# Grid Multi-Body: Scrollbar Refactoring and Vertical Restoration

As part of the Multi-Body Epic (#9486), this task focuses on refining the scrollbar architecture.

**Requirements:**
1. **Vertical Scrollbar Restoration:**
   - Reapply the `.neo-grid-body-wrapper` CSS class to the `bodyWrapper`.
   - Constrain the `bodyWrapper` flex item (e.g., `min-width: 0`) to prevent it from growing intrinsically and hiding its native vertical scrollbar off-screen.
2. **HorizontalScrollbar Refactoring:**
   - Rename `HorizontalScroller.mjs` to `HorizontalScrollbar.mjs` to align with the historical `VerticalScrollbar`.
   - Remove duplicated inline static styles (`overflow-x: auto`, `overflow-y: hidden`) from the JS config and VDOM.
   - Centralize these styles in a dedicated SCSS file for the component.

## Timeline

- 2026-03-31T14:25:27Z @tobiu added the `enhancement` label
- 2026-03-31T14:25:28Z @tobiu added the `ai` label
- 2026-03-31T14:25:28Z @tobiu added the `grid` label
- 2026-03-31T14:51:53Z @tobiu referenced in commit `c5d758a` - "feat: Grid Multi-Body architecture vertical scrollbar restoration and horizontal scrollbar styling (#9612)"
- 2026-03-31T14:51:53Z @tobiu referenced in commit `13ddbd0` - "feat: Add GridHorizontalScrollSync addon for multi-body scroller architecture (#9612)"
- 2026-03-31T14:52:43Z @tobiu assigned to @tobiu
### @tobiu - 2026-03-31T14:52:46Z

Completed the restructuring for the decoupled horizontal scrollbar architecture:
- Renamed `HorizontalScroller` to `HorizontalScrollbar` and relocated its inline styles to a dedicated SCSS file.
- Created `GridHorizontalScrollSync` addon to synchronize horizontal scrolling between the `GridContainer` components.
- Verified that horizontal scrolling causes both body and header columns to remain 1:1 synchronized perfectly.
- Restored the native vertical scrollbar pinned firmly inside the `bodyWrapper` against the right edge (via `min-width: 0`).

Closing as this fully satisfies the scrollbar decoupling requirements of the Grid Multi-Body architecture.

- 2026-03-31T14:52:49Z @tobiu closed this issue

