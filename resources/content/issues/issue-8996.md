---
id: 8996
title: 'perf: Implement Adaptive Backpressure for VDOM Updates via Pre-Update Hooks'
state: CLOSED
labels:
  - enhancement
  - ai
  - performance
  - core
assignees:
  - tobiu
createdAt: '2026-02-05T00:44:26Z'
updatedAt: '2026-02-05T01:19:17Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8996'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-05T01:16:34Z'
---
# perf: Implement Adaptive Backpressure for VDOM Updates via Pre-Update Hooks

**Context**
In high-frequency update scenarios (e.g., Grid scrolling), `ScrollManager` currently uses a fixed throttle (e.g., 48ms) to prevent flooding the VDOM worker with updates the Main Thread cannot consume fast enough ("Death Spiral").

While effective, a fixed timer is not adaptive. It caps performance on high-end devices (which could handle >20fps) and might still be too aggressive for very low-end devices.

**The Goal**
Implement **Adaptive Backpressure** where the producer (ScrollManager) automatically scales its update rate based on the consumer's (Main Thread) capacity.

**The Mechanism**
1.  **Backpressure Check:** The producer checks `component.isVdomUpdating`.
2.  **Opt-Out:** If `true`, the producer skips the heavy calculation (e.g., `createViewData`) and registers a **Pre-Update Hook**.
3.  **Re-Entry:** When the component finishes its current update (`resolveVdomUpdate`), it executes the registered Pre-Update Hook *before* checking `needsVdomUpdate` for the next cycle.

**Proposed Changes**

1.  **`src/manager/VDomUpdate.mjs`**:
    -   Add `preUpdateCallbackMap` (Map<String, Function[]>).
    -   Implement `registerPreUpdate(ownerId, callback)`.
    -   Implement `executePreUpdates(ownerId)`: Executes callbacks and clears the list.

2.  **`src/mixin/VdomLifecycle.mjs`**:
    -   Update `resolveVdomUpdate`:
        ```javascript
        // ... existing logic ...
        VDomUpdate.unregisterInFlightUpdate(me.id);
        VDomUpdate.triggerPostUpdates(me.id);

        // NEW: Execute Pre-Update Hooks (e.g. re-run createViewData)
        VDomUpdate.executePreUpdates(me.id);

        if (me.needsVdomUpdate) {
            me.update();
        }
        ```

3.  **Usage (Example)**:
    ```javascript
    // ScrollManager.mjs
    if (gridBody.isVdomUpdating) {
        // Queue the work for immediately after the current frame clears
        Neo.manager.VDomUpdate.registerPreUpdate(gridBody.id, () => {
             // This sets needsVdomUpdate = true internally
             gridBody.createViewData();
        });
        return;
    }
    ```

**Benefits**
-   **Zero Latency:** No fixed timers. Updates happen as fast as the hardware allows.
-   **Stability:** Impossible to flood the queue, as new work is only scheduled when the previous work completes.
-   **Efficiency:** Skips redundant calculations during blocked periods.

## Timeline

- 2026-02-05T00:44:27Z @tobiu added the `enhancement` label
- 2026-02-05T00:44:27Z @tobiu added the `ai` label
- 2026-02-05T00:44:28Z @tobiu added the `performance` label
- 2026-02-05T00:44:28Z @tobiu added the `core` label
- 2026-02-05T00:46:01Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-05T01:15:35Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the **Adaptive Backpressure** system to eliminate the fixed throttle dependency and prevent message queue flooding.
> 
> **Changes Implemented:**
> 
> 1.  **`Neo.manager.VDomUpdate`**: Added `preUpdateMap`, `registerPreUpdate(id, callback)`, and `executePreUpdates(id)`. This allows components to queue logic that *must* run immediately after their current update finishes but *before* the next update cycle starts.
> 2.  **`Neo.mixin.VdomLifecycle`**: Updated `resolveVdomUpdate` to call `VDomUpdate.executePreUpdates(me.id)`. This ensures queued logic (like `createViewData`) runs at the earliest possible safe moment, potentially setting `needsVdomUpdate` to trigger the next frame instantly.
> 3.  **`Neo.grid.Body`**: Refactored `createViewData` to check `me.isVdomUpdating`. If true, it aborts the calculation and registers itself via `registerPreUpdate` to retry automatically when the engine is free.
> 4.  **`Neo.grid.ScrollManager`**: Reverted the conservative `48ms` throttle back to `16ms` (approx 60fps). The grid now self-regulates: it runs at full speed on fast hardware and throttles gracefully on slow hardware without accumulating a backlog.
> 
> This architecture ensures zero input lag and maximum frame rate for the given hardware capability.

- 2026-02-05T01:16:34Z @tobiu closed this issue
### @tobiu - 2026-02-05T01:19:16Z

**Input from Gemini 3 Pro:**

> ✦ **Architectural Note:**
> We implemented the backpressure check directly inside `GridBody.createViewData` rather than in the consumer (`ScrollManager`).
> 
> **Rationale:**
> `createViewData` is the single point of entry for the expensive row calculation logic. By placing the guard and registration logic here, we protect the component from **all** potential triggers (Scroll events, Resize events, Store data changes, manual calls), not just scrolling. This encapsulation ensures the grid self-regulates its CPU usage under any heavy load scenario, providing a more robust and universal performance guarantee.


