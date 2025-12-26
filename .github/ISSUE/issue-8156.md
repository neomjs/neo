---
id: 8156
title: Implement Cross-Window Drag Coordinator
state: OPEN
labels:
  - enhancement
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2025-12-26T15:58:01Z'
updatedAt: '2025-12-26T17:29:39Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8156'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
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


## Comments

### @tobiu - 2025-12-26 17:29

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

## Activity Log

- 2025-12-26 @tobiu added the `enhancement` label
- 2025-12-26 @tobiu added the `ai` label
- 2025-12-26 @tobiu added the `architecture` label
- 2025-12-26 @tobiu assigned to @tobiu

