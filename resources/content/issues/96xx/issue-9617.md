---
id: 9617
title: 'Grid Multi-Body: Fix Row Scroll Pinning for Thumb Dragging'
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-03-31T20:45:03Z'
updatedAt: '2026-04-01T10:21:54Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9617'
author: tobiu
commentsCount: 3
parentIssue: 9486
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-01T10:21:54Z'
---
# Grid Multi-Body: Fix Row Scroll Pinning for Thumb Dragging

This epic sub focuses entirely on correcting the Vertical Row Scroll Pinning geometry mismatch under the Grid's new Multi-Body architecture. 

During migration to the new container-wrapper layout:
1. `GridBody.mjs` returns `vdom.cn[0]` for `getVdomRoot()`.
2. As a result, the `GridRowScrollPinning.mjs` addon targets the `.neo-grid-body-content` node instead of the `.neo-grid-body` node.
3. Because `.neo-grid-body-content` is inherently scaled (e.g., 500,000px height) to drive the scrollbar and flows naturally out of the viewport, its offset calculation via `translateY` fails to keep the rows bounded inside the visible window.

**Goal:** Provide the addon with the correct `.neo-grid-body` references and ensure `--grid-row-pin-offset` transforms act uniformly across `bodyStart`, `body`, and `bodyEnd` zones during native scroll events.

Relates to Epic #9486.

## Timeline

- 2026-03-31T20:45:04Z @tobiu added the `bug` label
- 2026-03-31T20:45:04Z @tobiu added the `ai` label
- 2026-03-31T20:45:12Z @tobiu added parent issue #9486
- 2026-03-31T20:50:10Z @tobiu assigned to @tobiu
### @tobiu - 2026-03-31T23:12:23Z

**Input from Gemini 3.1 Pro (Antigravity):**

> ✦ Hey Tobi, have a good night! I've spent the session analyzing the jitter and I agree that updating the Playwright e2e tests (`GridRowPinning.spec.mjs`, `GridThumbDrag.spec.mjs`) for the new Multi-Body architecture is our absolute best next step. It will give us frame-by-frame DOM traces to see exactly what's fighting us.
> 
> Here is a summary of my findings to review tomorrow:
> 
> 1. **The Mac OS Overlay Scrollbar Trap:** In the tests you just ran, `isThumbDragging` often stayed `false` because the strict boundary detection failed on Mac OS overlay scrollbars (which have `clientWidth === offsetWidth` and don't take up physical layout space, so `offsetX > clientWidth` is false).
> 2. **The Loss of `scrollbarNode`:** Before the Epic, `GridRowScrollPinning` listened for `mousedown` on the explicit `Neo.component.ScrollBar` DOM node. Now, because it's a native `overflow: auto` scrollbar, it listens on the `wrapperNode` itself. This makes reliably detecting "is the user actually dragging the thumb instead of just clicking inside the grid?" incredibly difficult and prone to false positives/negatives.
> 3. **The `GridDragScroll` Conflict:** You were spot on. `GridDragScroll` registers to the `bodyId` + `__wrapper` (which is the EXACT same wrapper node that pinning listens to). It intercepts drags and modifies `scrollTop` artificially. This physics loop is almost certainly colliding with the pinning offset logic.
> 4. **The Synchronous Math:** I traced the VDOM update cycle in `DeltaUpdates.mjs`. `GridRowScrollPinning.onDeltaUpdate` correctly catches the event *before* the Main Thread applies the DOM mutations. This means the Math *is* perfectly synchronous and safe from 1-frame snap-backs (which is why the old version worked flawlessly). The architecture is sound; the regression is 100% in the DOM event detection layer (`mousedown`/`isThumbDragging`) and layout overlap.
> 
> **Next Steps:**
> 1. Update the Playwright e2e tests for the new Multi-Body `wrapper` DOM structure.
> 2. Use the Playwright Trace Viewer to see the exact frame-by-frame state of `--grid-row-pin-offset` vs `scrollTop` during the jitter.
> 3. Implement a robust, cross-platform way to detect native scrollbar drags, potentially by isolating the scrollbar area or refining the `onMouseDown` coordinates.

- 2026-04-01T08:09:44Z @tobiu referenced in commit `c31aab8` - "Fix Mac OS native scrollbar drags, remove debug logs (#9617)"
### @tobiu - 2026-04-01T08:09:56Z

**Input from Gemini 3.1 Pro (Antigravity):**

> ✦ As requested, I have analyzed the previous debug state and pushed a clean-slate commit directly to `dev`. 
> 
> I also re-implemented the strict edge detection logic for `GridRowScrollPinning.mjs` that was lost when we reset the addon yesterday. The new bounded check logic now successfully differentiates between standard hardware scrollbars and Mac OS overlay scrollbars. `GridDragScroll` was also updated with the identical bounded logic so that the two addons will no longer fight when the user grabs the native scrollbar track.
> 
> We have a perfectly clean baseline for when we start investigating the Playwright traces!

- 2026-04-01T10:21:34Z @tobiu referenced in commit `98d0361` - "test(playwright): stabilize scrollbar locators for Multi-Body Grid Row Pinning telemetry (#9617)"
### @tobiu - 2026-04-01T10:21:46Z

**Input from Gemini 3.1 Pro (Antigravity):**

> ✦ Playwright E2E tests have been stabilized against the new Multi-Body wrapper architecture. The strict mode violations have been resolved by excluding `.neo-container` from the `.neo-grid-body-wrapper` selector, and the boundary detection for `mousedown` has been accurately mapped to `rect.right - 5`. This provides a baseline telemetry capture. Moving forward to a new ticket to track and synthesize the 50px/sec manual drag jitter.

- 2026-04-01T10:21:55Z @tobiu closed this issue

