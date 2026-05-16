---
id: 8915
title: Refactor GridDragScroll to use unified event handlers
state: CLOSED
labels:
  - developer-experience
  - ai
  - refactoring
  - performance
assignees:
  - tobiu
createdAt: '2026-01-30T13:17:40Z'
updatedAt: '2026-01-30T13:21:48Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8915'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-30T13:21:48Z'
---
# Refactor GridDragScroll to use unified event handlers

**Problem:**
The newly created `Neo.main.addon.GridDragScroll` contains significant code duplication between its mouse (`onMouseDown`, `onMouseMove`, `onMouseUp`) and touch (`onTouchStart`, `onTouchMove`, `onTouchEnd`) event handlers. The logic for delta calculation, registration lookup, and drag state management is nearly identical.

**Solution:**
Refactor the addon to use unified event handlers for both input types.

**Tasks:**
1.  **Unified Handlers:** Create `onDragStart`, `onDragMove`, and `onDragEnd` methods that handle both `MouseEvent` and `TouchEvent` types.
2.  **Coordinate Normalization:** Implement a helper or internal logic to extract `clientX` and `clientY` uniformly from either event type (using `event.touches[0]` for touch).
3.  **Registration Update:** Simplify `register` and `unregister` to attach these unified listeners based on `Neo.config.hasTouchEvents`.
4.  **Cleanup:** Remove the redundant separate handlers.

**Benefits:**
*   Reduced file size.
*   Improved maintainability (single source of truth for drag logic).
*   easier to extend in the future.

## Timeline

- 2026-01-30T13:17:41Z @tobiu added the `developer-experience` label
- 2026-01-30T13:17:41Z @tobiu added the `ai` label
- 2026-01-30T13:17:41Z @tobiu added the `refactoring` label
- 2026-01-30T13:17:41Z @tobiu added the `performance` label
- 2026-01-30T13:20:51Z @tobiu referenced in commit `023f6b7` - "refactor: Refactor GridDragScroll to use unified event handlers (#8915)"
- 2026-01-30T13:21:02Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-30T13:21:30Z

**Input from Gemini 3 Pro:**

> ✦ I have successfully refactored `Neo.main.addon.GridDragScroll` to use unified event handlers, significantly reducing code duplication.
> 
> ### Refactoring Details
> 
> **1. Unified Logic:**
> *   Replaced separate `onMouseDown`/`onTouchStart` with a single `onDragStart`.
> *   Replaced separate `onMouseMove`/`onTouchMove` with a single `onDragMove`.
> *   Replaced separate `onMouseUp`/`onTouchEnd` with a single `onDragEnd`.
> 
> **2. Coordinate Normalization:**
> *   Implemented `getEventCoordinates(event)` to abstract away the differences between `MouseEvent` (clientX/Y) and `TouchEvent` (touches[0].clientX/Y).
> 
> **3. Streamlined Registration:**
> *   The `register` and `unregister` methods now share the same handler references, with only minor conditional logic to determine which DOM event type (mousedown vs touchstart) to listen for based on `Neo.config.hasTouchEvents`.
> 
> **Outcome:**
> The addon is now more concise (removed ~57 lines) and easier to maintain, with a single source of truth for drag logic regardless of the input device. Behavior remains identical to the previous implementation.

- 2026-01-30T13:21:49Z @tobiu closed this issue

