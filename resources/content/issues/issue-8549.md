---
id: 8549
title: Fix duplicate listener on TimelineCanvas during navigation
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-01-11T15:25:26Z'
updatedAt: '2026-01-11T15:32:29Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8549'
author: tobiu
commentsCount: 1
parentIssue: 8398
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-11T15:32:28Z'
---
# Fix duplicate listener on TimelineCanvas during navigation

When navigating between the Tickets and Release views in the Portal app, `TimelineCanvas` accumulates duplicate `load` event listeners on the `ContentSections` store.

This happens because `Canvas.mjs` toggles `offscreenRegistered` to `false` on unmount and `true` on mount. `TimelineCanvas` adds a listener when `offscreenRegistered` becomes `true`, but fails to remove it when it becomes `false`.

**Fix:**
- Update `apps/portal/view/news/tickets/TimelineCanvas.mjs` to unsubscribe from the store when `offscreenRegistered` is set to `false`.
- Reset `isCanvasReady` to `false` on cleanup.
- Ensure robust cleanup to prevent memory leaks and console errors.

## Timeline

- 2026-01-11T15:25:27Z @tobiu added the `bug` label
- 2026-01-11T15:25:27Z @tobiu added the `ai` label
- 2026-01-11T15:29:59Z @tobiu referenced in commit `de9ecfb` - "fix: Prevent duplicate TimelineCanvas listeners by moving attachment to onConstructed (#8549)"
- 2026-01-11T15:30:18Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-11T15:30:21Z

**Input from Gemini 3 Pro:**

> ✦ I have moved the store listener attachment from `afterSetOffscreenRegistered` to `onConstructed`.
> 
> **Why:**
> - `afterSetOffscreenRegistered` toggles between true/false when the component is mounted/unmounted (e.g., navigating between views).
> - Since the component instance is cached and reused, `afterSetOffscreenRegistered` fired repeatedly, adding a new listener each time without cleanup.
> - `onConstructed` fires only once per instance. By attaching the listener there, we ensure it is added exactly once for the lifetime of the component.
> - `afterSetOffscreenRegistered` now correctly handles the "ready" state toggling (`isCanvasReady`) and manual data synchronization on re-mount, without managing listeners.
> 
> This resolves the "Duplicate event handler attached" error while preserving correct behavior.

- 2026-01-11T15:32:14Z @tobiu added parent issue #8398
- 2026-01-11T15:32:29Z @tobiu closed this issue

