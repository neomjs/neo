---
id: 9478
title: 'Grid ScrollManager: Support dynamic windowId changes for Main Thread Addon registration'
state: CLOSED
labels:
  - bug
  - ai
  - grid
assignees:
  - tobiu
createdAt: '2026-03-15T13:59:59Z'
updatedAt: '2026-03-15T14:06:57Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9478'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-15T14:06:57Z'
---
# Grid ScrollManager: Support dynamic windowId changes for Main Thread Addon registration

The `ScrollManager` for the `Neo.grid.Container` currently determines the `windowId` for registering Main Thread Addons (like `GridDragScroll` and `GridRowScrollPinning`) by reading it directly from its assigned `gridContainer` inside the addon update methods.

However, in a multi-window architecture, if a grid component is moved from one browser window to another, the `windowId` of the grid changes dynamically. Because `ScrollManager` extends `Neo.core.Base` and is instantiated once, simply reading the container's `windowId` on-the-fly or ignoring its dynamic updates means the addons won't be properly unregistered from the old window and registered in the new window.

To fix this and ensure full multi-window support:
1.  Introduce a `windowId_` reactive config in `ScrollManager`.
2.  Implement an `afterSetWindowId(value, oldValue)` hook. If `oldValue` is truthy (meaning a dynamic move happened), it should trigger a re-registration of the active addons.
3.  Update `Neo.grid.Container` to pass its `windowId` into the `ScrollManager` config during `onConstructed()`.
4.  Update `Neo.grid.Container`'s `afterSetWindowId` method to explicitly set the new `windowId` onto its `scrollManager` instance when a window move occurs.

## Timeline

- 2026-03-15T14:00:00Z @tobiu added the `bug` label
- 2026-03-15T14:00:00Z @tobiu added the `ai` label
- 2026-03-15T14:00:00Z @tobiu added the `grid` label
- 2026-03-15T14:06:24Z @tobiu referenced in commit `c1a4056` - "Grid ScrollManager: Support dynamic windowId changes for Main Thread Addon registration (#9478)"
### @tobiu - 2026-03-15T14:06:32Z

**Input from Gemini 3.1 Pro:**

> ✦ I have implemented the requested changes:
> 1. Introduced `windowId_` (String|null) to `Neo.grid.ScrollManager`.
> 2. Implemented `afterSetWindowId` to correctly unregister old addons and register new ones when the windowId changes dynamically.
> 3. Updated `Neo.grid.Container` to pass the initial `windowId` and properly proxy dynamic `windowId` changes to the `scrollManager`.
> 4. Fixed the formatting to use `let me = this;` per the standard.
> 
> The changes have been committed and pushed to the repository. I will now close the issue.

- 2026-03-15T14:06:44Z @tobiu assigned to @tobiu
- 2026-03-15T14:06:57Z @tobiu closed this issue

