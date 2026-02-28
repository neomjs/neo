---
id: 8914
title: Consolidate Grid Touch Scrolling into Main Thread Addon
state: CLOSED
labels:
  - enhancement
  - ai
  - refactoring
  - architecture
  - performance
assignees:
  - tobiu
createdAt: '2026-01-30T13:03:47Z'
updatedAt: '2026-01-30T13:14:46Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8914'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-30T13:14:46Z'
---
# Consolidate Grid Touch Scrolling into Main Thread Addon

**Problem:**
Currently, `Neo.grid.ScrollManager` handles touch scrolling logic (lastTouch positions, owner tracking) inside the App Worker, causing unnecessary cross-worker messaging and latency. Meanwhile, mouse scrolling has been successfully moved to the `Neo.main.addon.GridDragScroll` for superior performance.

**Solution:**
Consolidate all drag-to-scroll logic (both mouse and touch) into the `GridDragScroll` Main Thread Addon. This will make the addon the "single source of truth" for grid scrolling interactions.

**Architecture Changes:**

1.  **Refactor `Neo.main.addon.GridDragScroll`:**
    *   Implement `touchstart`, `touchmove`, `touchend` handlers.
    *   In `register()`, detect `Neo.config.hasTouchEvents`.
    *   If touch enabled: Attach touch listeners (passive: false, capture: true) instead of mouse listeners.
    *   Unified logic: Route both input types to the same delta tracking and scrolling implementation.
    *   Control: Use `preventDefault()` on touch moves to replace native scrolling with precise 1:1 drag-scrolling.

2.  **Cleanup `Neo.grid.ScrollManager`:**
    *   Remove all mobile-specific logic (`lastTouchX`, `lastTouchY`, `touchMoveOwner`).
    *   Remove `touchcancel` and `touchend` listeners from `construct`.
    *   Remove the `hasTouchEvents` guard from `updateDragScrollAddon` to enable the addon for all environments.

**Benefits:**
*   **Performance:** Zero-latency touch scrolling by avoiding App Worker round-trips.
*   **Maintainability:** Centralized scrolling logic in one place.
*   **Consistency:** Identical behavior across desktop and mobile.

## Timeline

- 2026-01-30T13:03:48Z @tobiu added the `enhancement` label
- 2026-01-30T13:03:48Z @tobiu added the `ai` label
- 2026-01-30T13:03:48Z @tobiu added the `refactoring` label
- 2026-01-30T13:03:48Z @tobiu added the `architecture` label
- 2026-01-30T13:03:49Z @tobiu added the `performance` label
- 2026-01-30T13:13:59Z @tobiu referenced in commit `374c1eb` - "enhancement: Consolidate Grid Touch Scrolling into Main Thread Addon (#8914)"
- 2026-01-30T13:14:09Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-30T13:14:22Z

**Input from Gemini 3 Pro:**

> ✦ I have successfully consolidated the grid touch scrolling logic into the `Neo.main.addon.GridDragScroll` addon.
> 
> ### Changes Implemented
> 
> **1. Main Thread Addon (`src/main/addon/GridDragScroll.mjs`)**
> *   **Touch Support:** Implemented `touchstart`, `touchmove`, and `touchend` handlers.
> *   **Unified Logic:** The addon now acts as the single source of truth for all drag scrolling.
>     *   In `register()`: It checks `Neo.config.hasTouchEvents`.
>     *   **Mobile:** Attaches touch listeners (`passive: false`, `capture: true`). Uses `preventDefault()` on `touchmove` to replace native scrolling with precise, zero-latency drag scrolling.
>     *   **Desktop:** Attaches mouse listeners as before.
> *   **Documentation:** Updated class JSDoc to reflect the dual support.
> 
> **2. ScrollManager Refactor (`src/grid/ScrollManager.mjs`)**
> *   **Cleanup:** Removed all legacy App Worker-side touch tracking (`lastTouchX`, `lastTouchY`, `touchMoveOwner`) and listeners.
> *   **Simplification:** `onBodyScroll` and `onContainerScroll` are now purely for syncing state, with no drag logic.
> *   **Renaming:** Renamed `mouseDragScroll_` to `dragScroll_` to reflect the broader scope.
> *   **Registration:** The `updateDragScrollAddon` method now unconditionally delegates to the addon, allowing the addon to decide which listeners to attach based on the environment.
> 
> ### Outcome
> This architecture change eliminates the overhead of passing high-frequency touch events between the Main Thread and App Worker. Grid scrolling on mobile devices is now handled directly in the Main Thread, resulting in zero-latency performance comparable to native scrolling, while maintaining the exact same logic and behavior as the desktop mouse drag.

- 2026-01-30T13:14:46Z @tobiu closed this issue

