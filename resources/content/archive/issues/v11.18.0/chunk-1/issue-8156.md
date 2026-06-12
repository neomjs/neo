---
id: 8156
title: Implement Cross-Window Drag Coordinator
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2025-12-26T15:58:01Z'
updatedAt: '2025-12-27T22:53:35Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8156'
author: tobiu
commentsCount: 5
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy:
  - '[x] 8159 Refactor Cross-Window Drag Logic to Dashboard SortZone'
blocking: []
closedAt: '2025-12-27T22:53:35Z'
---
# Implement Cross-Window Drag Coordinator

**Objective**
Enable seamless drag-and-drop operations between different browser windows (e.g., dragging a widget from the AgentOS window into the Colors window). This requires a coordinator to map global screen coordinates to specific dashboard instances across the shared App Worker.

**Architecture**

1.  **`Neo.manager.DragCoordinator` (New Singleton):**
    *   Acts as the central registry for drag operations spanning multiple windows.
    *   Dashboards register themselves with a `sortGroup` identifier.

2.  **Coordinate Mapping:**
    *   Leverage `Neo.manager.Window.getWindowAt(screenX, screenY)` to identify the target browser window under the cursor.
    *   Map global screen coordinates to the target window's local client coordinates.

3.  **Remote Drag Handling:**
    *   When a "Popup Proxy" (a detached widget in its own window) is dragged over a target dashboard in a different window:
        *   The Coordinator detects the intersection.
        *   It signals the target Dashboard's `SortZone`.
        *   The target `SortZone` renders a placeholder as if it were a local drag.

4.  **Drop Handling:**
    *   On drop, the item component is reparented from the source container to the target container.
    *   The VDOM engine handles the cross-window DOM updates.
    *   The popup window is automatically closed.


## Timeline

- 2025-12-26T15:58:02Z @tobiu added the `enhancement` label
- 2025-12-26T15:58:02Z @tobiu added the `ai` label
- 2025-12-26T15:58:02Z @tobiu added the `architecture` label
- 2025-12-26T17:24:48Z @tobiu assigned to @tobiu
### @tobiu - 2025-12-26T17:29:02Z

**Input from Gemini 3:**

> ✦ ## Context & Prerequisites Update
> 
> We have successfully completed the foundational refactoring required for this ticket (see #8155 and #8157).
> 
> **Current State:**
> 1.  **`Neo.dashboard.Container`**: Now natively supports the detached item lifecycle (detach-to-window, re-integrate). It tracks detached items via a `detachedItems` Map and listens to `Neo.currentWorker` for window connection events.
> 2.  **`Neo.dashboard.Panel`**: A new class created to encapsulate dashboard item configs, specifically `popupUrl`, enabling different app shells for different widgets.
> 3.  **App Refactoring**: Both `AgentOS` and `Colors` apps have been refactored to use this new architecture, removing their manual window management logic.
> 
> **Architectural Plan for #8156:**
> With the "Popup Proxy" mechanism now standardized, we can proceed with the **Cross-Window Drag Coordinator**.
> 
> 1.  **`Neo.manager.DragCoordinator` (Singleton in App Worker)**:
>     *   **Registry**: Dashboards will register themselves with a `sortGroup` identifier.
>     *   **Translation**: It will use `Neo.manager.Window` (the "God View") to hit-test global screen coordinates against registered window rectangles.
>     *   **Delegation**: When a popup (controlled by the main thread drag) hovers over a *different* dashboard window, the Coordinator will signal that target dashboard's `SortZone` to render a placeholder.
> 
> 2.  **Flow:**
>     *   **Source:** Dashboard A (Window 1) -> Item detached -> Popup Proxy.
>     *   **Transit:** Popup Proxy dragged over Window 2.
>     *   **Target:** Dashboard B (Window 2) detects "Remote Drag" via Coordinator.
>     *   **Drop:** Item component is reparented from Dashboard A to Dashboard B. VDOM engine handles the cross-window DOM move.
> 
> **Next Step:**
> Start implementation of `Neo.manager.DragCoordinator`.

- 2025-12-26T20:21:03Z @tobiu referenced in commit `cdadc0b` - "#8156 work in progress"
### @tobiu - 2025-12-26T20:21:10Z

**Input from Gemini 3:**

> ✦ # Session Handoff: Cross-Window Drag Implementation Status
> 
> We have made significant architectural progress but introduced regressions in the core drag logic. This comment serves as the recovery plan for the next session.
> 
> ## 1. Implemented Architecture (Do Not Discard)
> We established a robust "Handover Protocol" for dragging items between windows:
> *   **`Neo.manager.DragCoordinator`**: Implemented. Acts as the traffic controller.
>     *   Detects when a drag leaves the Source Window and enters a Target Window.
>     *   Orchestrates the handover.
> *   **`Neo.dashboard.Container`**:
>     *   Added `suspendWindowDrag(widgetName)`: Closes the popup and stops the Source's window-drag mode.
>     *   Added `resumeWindowDrag(widgetName, proxyRect)`: Re-opens the popup if the drag leaves the Target back into the void.
>     *   **Sort Groups:** Both `AgentOS` and `Colors` apps now use `sortGroup: 'neo-connected-dashboard'`.
> *   **`Neo.draggable.container.SortZone` (New Logic Only):**
>     *   Registers/Unregisters with Coordinator.
>     *   `startRemoteDrag`: Designed to create a **visible** local proxy in the Target, simulating a native drag.
>     *   `onRemoteDragMove/Drop`: Handles the target-side lifecycle.
> 
> ## 2. Resolved Concepts
> *   **The "Visible Proxy" Handover:** We agreed that the Source "Popup Window" should vanish upon entering the Target, replaced instantly by a local, visible `DragProxy` in the Target. This provides the best UX (looks like a native in-app drag).
> *   **State Ownership:** The Source Dashboard MUST be the one to call `suspendWindowDrag` because it owns the `detachedItems` map and the context to talk to the correct `DragDrop` addon instance.
> 
> ## 3. Critical Regressions & Open Issues (Immediate Actions Required)
> **The current state of `src/draggable/container/SortZone.mjs` is broken.**
> 
> 1.  **Local Drag Broken:** In our rush, we modified core methods like `applyAbsolutePositioning` and `setupDragState`, breaking standard local drag operations (positioning drift, `adjustItemRectsToParent` issues).
>     *   **Recovery:** Compare `SortZone.mjs` with `tmpSortZone.mjs` (the pre-session backup). **Revert** the core positioning logic to the backup version. *Only* re-apply the Coordinator hooks (`register`, `suspend`, `resume`) and the *new* remote methods (`startRemoteDrag`, etc.).
> 2.  **`onDragEnd` Errors:** We are seeing `TypeError: Cannot read properties of null (reading 'indexOf')` in `onDragEnd`. This indicates state corruption (likely `sortableItems` or `dragComponent` becoming null/invalid).
> 3.  **Code Quality:** There are unused parameters (e.g., in `applyAbsolutePositioning`) and messy logic. Needs a strict cleanup.
> 4.  **Window Manager Initialization:** `Neo.manager.Window.getWindowAt()` fails for new windows because `Window` manager doesn't fetch initial DOM rects on `connect`.
>     *   [x] **Action:** Update `Neo.manager.Window` to query window bounds immediately upon registration.
> 
> ## Next Steps
> 1.  **Restore SortZone:** Use `tmpSortZone.mjs` to fix the regressions in `SortZone.mjs`.
> 2.  **Fix Window Manager:** Ensure `Neo.manager.Window` has valid rects for new windows.
> 3.  **Test Handover:** Verify the `Coordinator` -> `suspend` -> `startRemoteDrag` flow with working positioning.

- 2025-12-27T11:03:23Z @tobiu referenced in commit `72d1964` - "#8156 restored onDragStart() to the working version"
- 2025-12-27T11:21:15Z @tobiu referenced in commit `de4d76b` - "#8156 Neo.manager.DragCoordinator: cleanup"
- 2025-12-27T12:13:38Z @tobiu referenced in commit `c6f1674` - "#8156 wip"
- 2025-12-27T13:56:23Z @tobiu referenced in commit `4ebcca3` - "#8156 wip"
- 2025-12-27T14:01:09Z @tobiu marked this issue as being blocked by #8159
### @tobiu - 2025-12-27T15:45:58Z

**Input from gemini:**

> ✦ ## Implementation Update & Architectural Refinement
> 
> We have successfully refactored the Drag & Drop architecture to support cross-window operations while maintaining a clean separation of concerns.
> 
> **Key Changes from Original Design:**
> 
> 1.  **Refactored `container/SortZone.mjs` (Base Class):**
>     *   **Role:** Now acts as a lightweight "detector" for drag operations.
>     *   **Window Detachment:** It detects when an item is dragged out of bounds (if `enableProxyToPopup` is true) and fires the `dragBoundaryExit` event. It explicitly **does not** implement the window opening or layout calculation logic (`startWindowDrag`, `calculateExpandedLayout` have been removed).
>     *   **Cleanup:** All dependencies on `DragCoordinator` and remote drag handling were removed.
> 
> 2.  **Enhanced `dashboard/SortZone.mjs` (Subclass):**
>     *   **Role:** Provides the concrete implementation for dashboard-specific drag behaviors.
>     *   **Window Drag:** Implements `startWindowDrag` and `calculateExpandedLayout` to handle the "detach to window" workflow triggered by the base class events.
>     *   **Cross-Window Coordination:** Registers with the `DragCoordinator` and implements the `onRemote*` methods (`startRemoteDrag`, `onRemoteDragMove`, etc.) to handle drags entering from other windows.
>     *   **Duplication Strategy:** Some layout logic (`calculateExpandedLayout`) was intentionally placed here to isolate the complex dashboard behavior from the generic container.
> 
> **Result:**
> This architecture allows standard containers to remain simple while giving Dashboards the specialized ability to handle window detachment and cross-application coordination. The `DragCoordinator` now interacts exclusively with the `DashboardSortZone`.

- 2025-12-27T16:52:19Z @tobiu referenced in commit `0cd5e77` - "#8156 wip"
- 2025-12-27T17:13:50Z @tobiu referenced in commit `ae2aa68` - "#8156 wip"
- 2025-12-27T17:22:57Z @tobiu referenced in commit `3ab07c0` - "#8156 testing logs"
- 2025-12-27T19:11:24Z @tobiu referenced in commit `340cc5f` - "#8156 wip"
- 2025-12-27T20:01:01Z @tobiu referenced in commit `4d1cc24` - "#8156 wip"
- 2025-12-27T20:49:11Z @tobiu referenced in commit `da447c9` - "#8156 wip"
### @tobiu - 2025-12-27T20:50:25Z

**Input from Gemini 2.5:**

> ✦ ✦ ## Cross-Window Drag Proxy & Coordination Logic Fixed
> 
> We have resolved several critical issues impacting the positioning, sizing, and movement of the cross-window drag proxy.
> 
> **Key Fixes Implemented:**
> 
> 1.  **Proxy Sizing & Layout Thrashing:**
>     *   **Issue:** The drag proxy was defaulting to the full width of the source window/container (775px) instead of the target item width (716px), causing layout distortion.
>     *   **Fix:** Updated `DashboardSortZone.startRemoteDrag` to create the `dragPlaceholder` with `flex: 'none'` and no fixed width. This allows it to naturally adopt the target container's layout dimensions (e.g., 716px) *before* `setupDragState` measures it. The proxy size is then explicitly set to match this measured placeholder size.
> 
> 2.  **Vertical Positioning (Browser Chrome Gap):**
>     *   **Issue:** The proxy appeared vertically offset (lower) than the mouse cursor.
>     *   **Root Cause:** `DragCoordinator` was calculating coordinates relative to the window frame (`screenTop`), while the proxy (in `document.body`) is positioned relative to the viewport. The difference is the browser chrome height.
>     *   **Fix:** Updated `Neo.manager.Window` to calculate and store `headerHeight` (`outerHeight - innerHeight`). Updated `DragCoordinator.onDragMove` to subtract this `headerHeight` from `localY`, correctly mapping screen coordinates to the viewport.
> 
> 3.  **Horizontal Positioning & Sorting Logic:**
>     *   **Issue:** Adjusting the proxy's visual position (`left`) independently of the logical drag offset (`offsetX`) caused the sorting logic (`onDragMove`) to miscalculate the item's position relative to slots, triggering re-ordering too early or late.
>     *   **Fix:** Synchronized the visual and logical coordinates. In `startRemoteDrag`, we now add the dashboard's offset (`ownerRect`) to `me.offsetX` and `me.offsetY`. This ensures that both the visual style calculation (`localX - me.offsetX`) and the sorting delta (`clientX - me.offsetX - itemRect.left`) operate on the same consistent coordinate basis, incorporating the "divergence" between the viewport and the dashboard container.
> 
> 4.  **Remote Drag Movement:**
>     *   **Issue:** The proxy was not updating its position during the drag.
>     *   **Root Cause:** `DragZone.dragMove` defaults to skipping updates if `moveInMainThread` is true (which is the default for `DashboardSortZone`).
>     *   **Fix:** Enhanced `DragZone.dragMove` to accept a `force` parameter. Updated `DashboardSortZone.onRemoteDragMove` to call `me.dragMove(..., true)`, forcing the worker-side update for remote drags without needing to toggle instance configuration state.
> 
> **Current Status:**
> The cross-window drag operation now correctly creates a proxy that:
> *   Matches the target dashboard's column width.
> *   Aligns perfectly with the mouse cursor (accounting for window chrome and offsets).
> *   Updates position smoothly during the drag.
> *   Triggers sorting re-orders at the expected visual thresholds.

- 2025-12-27T22:45:56Z @tobiu referenced in commit `26c1f84` - "#8156 cleanup"
- 2025-12-27T22:46:54Z @tobiu referenced in commit `d0c916d` - "#8156 work in progress"
- 2025-12-27T22:46:54Z @tobiu referenced in commit `7de06ab` - "#8156 restored onDragStart() to the working version"
- 2025-12-27T22:46:55Z @tobiu referenced in commit `5053551` - "#8156 Neo.manager.DragCoordinator: cleanup"
- 2025-12-27T22:46:55Z @tobiu referenced in commit `6c4e9e9` - "#8156 wip"
- 2025-12-27T22:46:55Z @tobiu referenced in commit `001b84f` - "#8156 wip"
- 2025-12-27T22:46:55Z @tobiu referenced in commit `8b907fa` - "#8156 wip"
- 2025-12-27T22:46:55Z @tobiu referenced in commit `8816181` - "#8156 wip"
- 2025-12-27T22:46:55Z @tobiu referenced in commit `546e620` - "#8156 testing logs"
- 2025-12-27T22:46:55Z @tobiu referenced in commit `a174715` - "#8156 wip"
- 2025-12-27T22:46:55Z @tobiu referenced in commit `000d4cf` - "#8156 wip"
- 2025-12-27T22:46:56Z @tobiu referenced in commit `41d1e59` - "#8156 wip"
- 2025-12-27T22:46:56Z @tobiu referenced in commit `8f52386` - "#8156 cleanup"
### @tobiu - 2025-12-27T22:53:35Z

closing the ticket, since we reached the poc state.

- 2025-12-27T22:53:35Z @tobiu closed this issue

