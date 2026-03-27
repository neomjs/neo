---
id: 9489
title: 'Grid Multi-Body: Decoupled Horizontal Scroller & Main Thread Sync'
state: OPEN
labels:
  - enhancement
  - ai
  - grid
assignees:
  - tobiu
createdAt: '2026-03-16T18:16:28Z'
updatedAt: '2026-03-17T18:59:06Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9489'
author: tobiu
commentsCount: 0
parentIssue: 9486
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Grid Multi-Body: Decoupled Horizontal Scroller & Main Thread Sync

Phase 3 of the Multi-Body Epic (#9486).

To guarantee zero vertical jitter, the V2 architecture places the Center SubGrid inside an outer wrapper that handles vertical scrolling. This pushes the native horizontal scrollbar of the Center SubGrid to the absolute bottom of the virtualized data (e.g., 500,000px down), making it unusable.

We must build a decoupled, "fake" horizontal scrollbar that stays pinned to the bottom of the visible grid viewport.

**Requirements:**
1. **`Neo.grid.HorizontalScroller` Component:**
    - Create a new component that renders a native horizontal scrollbar but contains no actual data.
    - DOM structure concept: `<div style="overflow-x: auto"><div style="width: {TotalCenterColumnsWidth}px"></div></div>`
    - Position it as a sibling to the `grid.Container` body wrapper (e.g., just above the Footer Toolbar).
2. **Main Thread Addon (`GridHorizontalScrollSync`):**
    - Create a new Main Thread Addon to handle the high-frequency syncing.
    - It must register the DOM node of the `HorizontalScroller` and the DOM nodes of the `Center SubGrid` and `Center Header`.
    - It must attach a `scroll` listener to the fake scroller.
    - On scroll, it must synchronously execute `centerSubGridNode.scrollLeft = scrollLeft` and `centerHeaderNode.scrollLeft = scrollLeft`.
3. **Visibility Logic:**
    - The `HorizontalScroller` should only render/be visible if the `Center SubGrid` actually requires horizontal scrolling (i.e., total center column width > available center viewport width).

## Timeline

- 2026-03-16T18:16:29Z @tobiu added the `enhancement` label
- 2026-03-16T18:16:29Z @tobiu added the `ai` label
- 2026-03-16T18:16:29Z @tobiu added the `grid` label
- 2026-03-16T18:16:41Z @tobiu added parent issue #9486
- 2026-03-17T18:59:06Z @tobiu assigned to @tobiu

