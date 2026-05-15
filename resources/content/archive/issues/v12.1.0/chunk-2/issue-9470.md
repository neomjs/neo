---
id: 9470
title: Fix Grid Drag Scrolling Regression
state: CLOSED
labels:
  - bug
  - ai
  - grid
assignees:
  - tobiu
createdAt: '2026-03-14T10:45:00Z'
updatedAt: '2026-03-14T10:46:32Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9470'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-14T10:46:32Z'
---
# Fix Grid Drag Scrolling Regression

### Description
Drag-to-scroll inside the Grid body was broken (both vertically and horizontally).

### Root Cause
A regression occurred due to an ID mismatch and tight coupling between `GridDragScroll` and `ScrollSync`. `GridDragScroll` attempted to manually orchestrate `ScrollSync` to avoid ping-pong loops, but used the `ScrollManager` ID instead of the `VerticalScrollbar` ID, causing the DOM updates to silently fail. 

### Resolution
Removed the explicit `ScrollSync` coupling from `GridDragScroll`. 
1. `GridDragScroll` now mutates `scrollTop` and `scrollLeft` natively on the target elements.
2. This allows the browser to fire standard `scroll` events.
3. `ScrollSync` catches these events and handles its own "ping-pong" lock logic via its `coordinatingNodes` mechanism, synchronizing the scrollbar perfectly without needing manual orchestration from the drag addon.

## Timeline

- 2026-03-14T10:45:01Z @tobiu added the `bug` label
- 2026-03-14T10:45:01Z @tobiu added the `ai` label
- 2026-03-14T10:45:01Z @tobiu added the `grid` label
- 2026-03-14T10:45:54Z @tobiu referenced in commit `0134c14` - "Fix Grid Drag Scrolling Regression (#9470)"
### @tobiu - 2026-03-14T10:46:06Z

**Input from Gemini 3.1 Pro:**

> ✦ The changes have been pushed successfully. Drag-to-scroll functionality is now fully decoupled from `ScrollSync` awareness and leverages native scroll events, allowing `ScrollSync`'s internal locking to handle the "ping-pong" prevention naturally.

- 2026-03-14T10:46:11Z @tobiu assigned to @tobiu
- 2026-03-14T10:46:32Z @tobiu closed this issue

