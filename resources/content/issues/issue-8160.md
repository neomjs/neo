---
id: 8160
title: Decouple and Configure Window Detachment Thresholds in SortZone
state: OPEN
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-12-27T21:00:50Z'
updatedAt: '2025-12-28T13:12:27Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8160'
author: tobiu
commentsCount: 1
parentIssue: 8163
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Decouple and Configure Window Detachment Thresholds in SortZone

Currently, `Neo.draggable.container.SortZone` uses the same intersection logic (or similar 50% ratios) for both in-app item sorting (swapping items) and window detachment/re-integration. This limits UX tuning, as users often expect a "tear-off" into a new window to happen sooner (e.g., at 20% overlap) than an item swap.

**Goal:**
1.  Decouple the window detachment/re-integration thresholds from the standard sorting thresholds.
2.  Introduce specific configs (e.g., `detachThreshold: 0.2`, `reattachThreshold: 0.8`).
3.  Ensure `onDragMove` logic uses the correct threshold for the correct action (sorting vs. window boundary checks).

## Timeline

- 2025-12-27T21:00:51Z @tobiu added the `enhancement` label
- 2025-12-27T21:00:52Z @tobiu added the `ai` label
- 2025-12-27T21:33:39Z @tobiu added parent issue #8163
- 2025-12-28T00:07:46Z @tobiu assigned to @tobiu
- 2025-12-28T02:14:46Z @tobiu referenced in commit `9a7d24f` - "Decouple and Configure Window Detachment Thresholds in SortZone #8160 wip"
- 2025-12-28T13:10:16Z @tobiu referenced in commit `628fb8d` - "#8160 wip"
### @tobiu - 2025-12-28T13:11:50Z

**Input from Gemini:**

> ✦ ### Session Refactoring Summary (Issue #8160)
> 
> In this session, we focused on decoupling window detachment thresholds and consolidating the intersection logic.
> 
> **Key Changes:**
> 1.  **`SortZone.mjs` Refactoring**:
>     *   Extracted the core intersection and threshold logic into a dedicated `checkWindowBoundary(data)` method.
>     *   Introduced an `onWindowDragContinue(intersectionRatio, data)` hook, allowing subclasses to react to drag moves that stay within the detached/attached state boundaries.
>     *   Consolidated the logic for `detachThreshold` and `reattachThreshold` to ensure consistent behavior across all sorting zones.
> 2.  **`DashboardSortZone.mjs` Alignment**:
>     *   Removed duplicated boundary check logic in `onDragMove`, now delegating to `super.onDragMove()`.
>     *   Implemented `onWindowDragContinue` to handle the hand-off to `DragCoordinator` for remote drag updates when the item is detached.
> 3.  **State Sanitation**:
>     *   Removed the experimental `isReintegrating` flag and logic, reverting to a cleaner state machine.
> 4.  **Method Ordering**:
>     *   Methods have been re-sorted chronologically per project guidelines.
> 
> **Outcome:**
> The threshold logic is now centralized and correctly handles directionality (inwards vs. outwards) using `lastIntersectionRatio`. The system is prepared for further investigation into the re-detach behavior after full re-integration.


