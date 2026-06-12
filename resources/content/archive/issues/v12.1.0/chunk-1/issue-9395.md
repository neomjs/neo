---
id: 9395
title: 'E2E: Refine GridRowScrollPinning to Target Explicit Thumb Drags'
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
  - grid
assignees:
  - tobiu
createdAt: '2026-03-08T17:12:38Z'
updatedAt: '2026-03-08T17:15:01Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9395'
author: tobiu
commentsCount: 1
parentIssue: 9380
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-08T17:15:01Z'
---
# E2E: Refine GridRowScrollPinning to Target Explicit Thumb Drags

This ticket documents the refinement of the `GridRowScrollPinning` addon to solve the "wheel jitter" regression.

**The Problem:**
The previous implementation relied on a mathematical `deltaY` threshold to engage optical pinning. However, Playwright telemetry revealed that this generic threshold caused the addon to fight against native smooth wheel scrolling. A fast wheel spin could exceed the threshold, triggering the addon to instantly halt the native scroll momentum and then "snap" when the worker caught up, resulting in extreme ping-pong jitter.

**The Solution (Stateful Detection):**
We have abandoned the generic distance threshold in favor of explicit interaction intent. The addon now only pins the UI when the user is physically dragging the scrollbar thumb.

**Implementation Details:**
1.  **Lifecycle Hook:** `ScrollManager` now passes the `scrollbarId` to the addon during registration.
2.  **Targeted Mousedown:** `GridRowScrollPinning` attaches `mousedown` and `touchstart` listeners explicitly to the custom `VerticalScrollbar` component, engaging an `isThumbDragging` state.
3.  **Global Mouseup:** To safely catch the drag release (even if the cursor leaves the browser window), a global `window` `mouseup` listener is dynamically attached during the drag and immediately removed upon release to prevent memory leaks in Card Layout unmount scenarios.
4.  **Debounced Safety Net:** A 250ms debounced `scroll` listener acts as an ultimate fallback to clear the `isThumbDragging` state if the global `mouseup` is somehow missed.
5.  **Exclusive Pinning:** `applyPinning` now *only* applies the CSS optical shift if `isThumbDragging` is true.

**The Result:**
Wheel scrolling, trackpad scrolling, and Body Drag scrolling (`GridDragScroll`) are now 100% ignored by this addon, preserving their perfect native smooth physics. Optical pinning acts purely as an unbreakable safety net for manual scrollbar thumb dragging to prevent the white flash.

## Timeline

- 2026-03-08T17:12:39Z @tobiu added the `enhancement` label
- 2026-03-08T17:12:39Z @tobiu added the `ai` label
- 2026-03-08T17:12:39Z @tobiu added the `architecture` label
- 2026-03-08T17:12:39Z @tobiu added the `grid` label
- 2026-03-08T17:12:52Z @tobiu added parent issue #9380
- 2026-03-08T17:14:24Z @tobiu referenced in commit `46ee4c1` - "Enhancement: Refine GridRowScrollPinning to Target Explicit Thumb Drags (#9395)

- Replaced absolute scroll thresholds with explicit interaction intent tracking.
- Addon now tracks `isThumbDragging` state via `mousedown` / `touchstart` on the VerticalScrollbar component.
- Dynamically attaches a global `window` `mouseup` / `touchend` listener to safely catch drag release, preventing leaks in unmount scenarios.
- Implemented a 250ms debounced `scroll` listener fallback to aggressively clear orphaned states.
- `applyPinning` now exclusively injects the CSS optical shift when `isThumbDragging` is true.
- Completely restored perfect, jitter-free native physics for wheel scrolling, trackpad scrolling, and Body Drag scrolling (`GridDragScroll`)."
- 2026-03-08T17:14:36Z @tobiu assigned to @tobiu
### @tobiu - 2026-03-08T17:14:38Z

**Input from Gemini 3.1 Pro:**

> ✦ The "Stateful Source Detection" refactor has been successfully tested, committed, and pushed.
> 
> **Final Summary:**
> - The addon now strictly tracks user intent via `mousedown` on the `VerticalScrollbar` component, engaging an `isThumbDragging` state.
> - Wheel scrolling, trackpad swipes, and body drag scrolling are 100% ignored, completely restoring perfect, native, jitter-free scroll physics to the core UX.
> - The CSS Variable optical pinning (`--grid-row-pin-offset`) now functions *exclusively* as a targeted safety net for manual scrollbar thumb dragging, freezing the stale rows to eliminate the white flash, and gracefully healing via a dynamic global `mouseup` listener when the user releases the thumb.
> 
> This concludes the architectural goals defined in this ticket. Closing.

- 2026-03-08T17:15:01Z @tobiu closed this issue

