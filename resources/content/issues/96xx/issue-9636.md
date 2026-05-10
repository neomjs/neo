---
id: 9636
title: 'Grid Multi-Body: Simplify GridDragScroll Scrollbar Hit Detection'
state: OPEN
labels:
  - enhancement
  - ai
  - grid
assignees:
  - tobiu
createdAt: '2026-04-02T23:02:24Z'
updatedAt: '2026-04-02T23:03:21Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9636'
author: tobiu
commentsCount: 0
parentIssue: 9486
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Grid Multi-Body: Simplify GridDragScroll Scrollbar Hit Detection

With the reintroduction of the dedicated proxy `VerticalScrollbar` component, the `grid.View` no longer utilizes native scrollbars within its direct bounding geometry (both vertical and horizontal proxies are now absolutely positioned overlays).

The `GridDragScroll` Main Thread addon currently uses complex bounding box mathematics (`getBoundingClientRect()`, `event.offsetX`, `clientWidth`) to guess if a `mousedown` originated over a native scrollbar, to prevent panning the grid while dragging the scroll thumb.

We can completely remove this localized mathematical logic. Since the scrollbars are now discrete proxy DOM nodes, we can rely directly on `event.target` boundaries, exactly as currently implemented in the `neo-testing` branch. 

**Task:**
Refactor `GridDragScroll.mjs` scrollbar hit-detection logic to replace bounding box math with direct target node verification using the newly introduced vertical and horizontal proxy nodes.

## Timeline

- 2026-04-02T23:02:26Z @tobiu added the `enhancement` label
- 2026-04-02T23:02:26Z @tobiu added the `ai` label
- 2026-04-02T23:02:26Z @tobiu added the `grid` label
- 2026-04-02T23:02:31Z @tobiu added parent issue #9486
- 2026-04-02T23:03:21Z @tobiu assigned to @tobiu

