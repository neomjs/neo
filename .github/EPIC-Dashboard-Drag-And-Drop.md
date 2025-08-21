# Epic: Dashboard Drag & Drop

## Overview

This epic covers the implementation of drag-and-drop functionality for the main widgets within the Colors App dashboard (`apps/colors/view/Viewport.mjs`). The goal is to allow users to reorder the Grid, Pie Chart, and Bar Chart components. The implementation should be inspired by the fluid, main-thread driven drag-and-drop logic used for `TabContainer` headers.

This epic serves as the foundational R&D for the multi-window dashboard capabilities of the upcoming Neo Studio.

## Key Requirements
- Users can reorder the three main dashboard widgets.
- The `HeaderToolbar` at the top of the viewport will be excluded from reordering.
- The drag operation should be initiated by clicking and dragging the header of each widget.
- The drag-and-drop experience should be visually fluent, with the drag proxy moving pixel-by-pixel.

## Design Rationale & Strategy

This section outlines the key architectural decisions and strategic insights that inform the implementation phases.

-   **Architectural Approach (Phase 1):** The plan is to refactor the existing `toolbar.SortZone` into a more generic `container.SortZone`. While simply reusing the toolbar-specific class might be a faster shortcut, the refactoring approach was chosen as the correct long-term solution. It establishes a clean, reusable abstraction for sorting items in any flexbox-based container, improving maintainability and avoiding technical debt.

-   **Live Proxy (Phase 2):** The core goal is to create a high-fidelity user experience, where the dragged component is not a static image but remains a fully "live" instance. This leverages the Neo.mjs VDOM engine's ability to reparent live components, which is a key technical differentiator and provides the foundation for the advanced effects in Phase 3.

-   **Dynamic Windowing (Phase 3):** The implementation of this ambitious phase is significantly de-risked and accelerated by adapting existing, proven logic. The `apps/colors/view/ViewportController` already contains robust functionality for detaching a live widget into a separate popup window. Phase 3 will adapt this logic to trigger dynamically mid-drag. Furthermore, `Neo.util.Rectangle.getIntersection()` has been identified as the ideal utility for the boundary-check calculations.

## Phase 1: Foundational Sorting

**Status: Complete** - Core reordering functionality implemented. Viewport restructured to use `Neo.dashboard.Container`, and `container.SortZone` developed with `dragHandleSelector`.

**Tracking Ticket:** [ticket-dashboard-initial-drag-drop.md](./ticket-dashboard-initial-drag-drop.md)

The primary goal of this phase is to implement the core reordering functionality with a standard visual proxy.

1.  **Restructure Viewport:**
    -   In `apps/colors/view/Viewport.mjs`, wrap the `GridContainer`, `PieChartComponent`, and `BarChartComponent` each within a `Neo.container.Panel`.
    -   This will provide distinct header elements to serve as drag handles.

2.  **Develop `Container.SortZone`:**
    -   Create a new, reusable `SortZone` class tailored for generic containers (e.g., `src/draggable/container/SortZone.mjs`).
    -   This class will extend `Neo.draggable.DragZone`.
    -   It will be created by refactoring the logic from the existing `Neo.draggable.toolbar.SortZone` to work with any `vbox` or `hbox` layouts. The `toolbar.SortZone` will then be updated to extend this new container-level class.

3.  **Integration:**
    -   Instantiate the new `Container.SortZone` within the `Colors.view.Viewport` to activate the drag-and-drop functionality on the new panels.
    -   The panel headers will be configured with the `.neo-draggable` class to act as the delegate target for the `SortZone`.

## Phase 2: Live In-Page Proxy

**Status: Complete** - Live proxy implemented by overriding `createDragProxy` in `DashboardSortZone` to move the actual component instance.

The goal of this phase is to enhance the user experience by making the drag proxy a live, interactive component that continues to receive real-time updates during the drag operation. This is the foundational step for the dynamic windowing in Phase 3.

1.  **Override Drag Proxy Creation:**
    -   The `Container.SortZone` will override the `createDragProxy` method.

2.  **Implement Component Reparenting:**
    -   Instead of creating a static clone of the widget's VDOM for the proxy, the new logic will temporarily move the *actual component instance* into the `DragProxyComponent`.
    -   This will leverage the VDOM engine's capability to move live DOM nodes, ensuring the component within the proxy remains fully functional and continues to process data updates.

3.  **Finalize Drop Logic:**
    -   On drop, the live component will be moved from the proxy container back into its new position in the `Viewport`'s layout.

## Phase 3: Dynamic Proxy Transitioning (Windowing)

**Status: In Progress** - Boundary detection and event bubbling mechanism implemented.

This phase builds directly on the live proxy from Phase 2, introducing a seamless transition between an in-page proxy and a separate browser window, based on the drag location. This will adapt the existing "detach widget" logic found in `Colors.view.ViewportController`.

1.  **API Integration & Boundary Detection:**
    -   Integrate the Window Management API for window placement control.
    -   During a `drag:move` operation, use `Neo.util.Rectangle.getIntersection()` to continuously calculate the overlap between the live proxy's bounds and the viewport's bounds.

2.  **Seamless Proxy-to-Window Transition:**
    -   If the proxy is dragged more than 50% outside the viewport, trigger a transition:
        - The drag operation will continue without interruption.
        - **Adapt the logic from `ViewportController.createBrowserWindow()`:** A new popup window will be created at the proxy's current screen coordinates.
        - The live component will be moved from the in-page proxy into the new popup, reusing the existing child app and connection logic (`onAppConnect`).
        - The in-page proxy will be destroyed, and the drag operation will now move the popup window using `popup.moveTo()`.

3.  **Seamless Window-to-Proxy Transition ("Docking"):**
    -   If a dragged popup window is moved back to overlap the viewport by more than 50%, it will automatically transition back:
        - The drag operation will continue without interruption.
        - **Adapt the logic from `ViewportController.onAppDisconnect()`:** Instead of just re-inserting the widget into the layout, it will be moved into a new live in-page proxy created at the window's current position.
        - The popup window will be closed.
        - The drag operation will revert to moving the in-page proxy, allowing for re-sorting within the viewport.

## Phase 4: Framework-Level Dashboard Abstraction

The final phase is to abstract the logic and components developed in the Colors app into generic, reusable, and configurable framework-level classes. This will provide the foundation for building multi-window dashboards within the Neo Studio environment.

1.  **Promote `dashboard.Container`:**
    -   Enhance the existing `Neo.dashboard.Container` to become the primary tool for creating dashboards.
    -   It will encapsulate the core layout and item management logic derived from this epic.

2.  **Finalize Draggable Components:**
    -   Ensure the `Neo.draggable.container.SortZone` is a robust, documented, and easily configurable class for general use.
    -   Consider creating a specialized `Neo.dashboard.Panel` (or similar component) that has the dynamic drag-and-drop and windowing behaviors from Phases 2 & 3 built-in as a configurable option.

3.  **Create Documentation & Examples:**
    -   Develop comprehensive documentation for the new dashboard classes.
    -   Create new, focused examples to demonstrate how developers can build their own multi-window dashboards using these new framework-level tools.
