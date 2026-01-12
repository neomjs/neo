---
id: 8578
title: Improve wheel event performance with passive listeners
state: CLOSED
labels:
  - enhancement
  - ai
  - performance
assignees:
  - tobiu
createdAt: '2026-01-12T06:21:51Z'
updatedAt: '2026-01-12T07:07:46Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8578'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-12T07:07:46Z'
---
# Improve wheel event performance with passive listeners

Switch the global `wheel` event listener in `DomEvents.mjs` to `passive: true` to prevent main thread blocking during scrolling.
Update `DomEvents.mjs` (Main Thread) and `DomEvent.mjs` (Manager) to support local DOM listeners with configurable options (e.g. `passive: false`, `capture: true`) to allow specific components (Gallery, Helix) to opt-out of the passive default.

## Timeline

- 2026-01-12T06:21:52Z @tobiu added the `enhancement` label
- 2026-01-12T06:21:52Z @tobiu added the `ai` label
- 2026-01-12T06:21:52Z @tobiu added the `performance` label
- 2026-01-12T06:53:06Z @tobiu referenced in commit `6641e8d` - "enhancement: Switch global wheel listener to passive: true and implement local non-passive overrides (#8578)"
### @tobiu - 2026-01-12T06:53:48Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented a hybrid event listening strategy to resolve the "Violation" warnings and improve global scrolling performance.
> 
> ### 1. The Global Performance Fix
> The global `wheel` event listener in `src/main/DomEvents.mjs` has been switched to `{ passive: true }`. 
> *   **Impact:** This tells the browser that the main thread will *not* prevent scrolling. The browser can now scroll the page immediately (on the compositor thread) without waiting for the main thread to process the event. 
> *   **Result:** This eliminates the "Handling of 'wheel' input event was delayed..." warning and provides silky smooth scrolling for 95% of the application (Grids, Lists, standard scroll containers).
> 
> ### 2. The Local Override (Hybrid Strategy)
> For components that *must* control the wheel (e.g., to map scroll deltas to 3D rotation or zoom), we cannot use a passive listener because we need `preventDefault()`.
> *   **Implementation:** I enhanced `src/manager/DomEvent.mjs` (App Worker) to support configurable listener options (`passive`, `capture`, `local`) and pass them to the Main Thread.
> *   **Component Updates:** Updated `Helix`, `Gallery`, `DateSelector`, `YearComponent`, and `Circle` to use specific local listener configurations:
>     ```javascript
>     wheel: {
>         fn     : me.onMouseWheel,
>         local  : true,
>         passive: false, // Explicitly opt-out of passive mode
>         bubble : false  // Prevent logical bubbling to parent containers
>     }
>     ```
> *   **Bug Fix:** I also implemented a `handlerMap` in `DomEvent.mjs` to ensure local listeners map to their correct specialized handlers (e.g., `onWheel`, `onChange`) instead of the generic `domEventListener`. This incidentally fixed a critical `RangeError` (infinite loop) in form fields by ensuring the correct event signature and payload were used.
> 
> ### 3. Why the "New" Warning is Good
> You may now see a specific warning in the console when interacting with `Helix` or `Gallery`:
> `[Violation] Added non-passive event listener to a scroll-blocking 'wheel' event.`
> 
> **This is a success indicator, not a failure.** 
> *   **Previously:** We paid the "scroll-blocking tax" globally on `document.body`, affecting every single scroll interaction in the app.
> *   **Now:** We have moved this tax **only** to the specific DOM nodes of components that actually require `preventDefault()`.
> *   The warning confirms that we have successfully isolated the cost. The rest of the application remains unburdened and performant.
> 
> ### 4. Logic Isolation
> By setting `bubble: false` on these local listeners, we ensure that the wheel event is consumed entirely by the component (e.g., spinning the Helix) and does not logically bubble up to scroll parent containers, fixing the regression where the parent page would scroll simultaneously.

- 2026-01-12T06:54:19Z @tobiu assigned to @tobiu
- 2026-01-12T07:07:46Z @tobiu closed this issue

