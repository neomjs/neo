---
id: 7201
title: Dashboard Drag & Drop
state: OPEN
labels:
  - enhancement
  - epic
  - stale
assignees:
  - tobiu
createdAt: '2025-08-20T22:03:47Z'
updatedAt: '2025-11-19T02:51:55Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7201'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues:
  - 7202
  - 7203
  - 7204
  - 7205
  - 7206
  - 7207
  - 7208
  - 7209
  - 7210
subIssuesCompleted: 4
subIssuesTotal: 9
blockedBy: []
blocking: []
---
# Dashboard Drag & Drop

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

## Comments

### @github-actions - 2025-11-19 02:51

This issue is stale because it has been open for 90 days with no activity.

## Activity Log

- 2025-08-20 @tobiu assigned to @tobiu
- 2025-08-20 @tobiu added the `enhancement` label
- 2025-08-20 @tobiu added the `epic` label
- 2025-08-20 @tobiu referenced in commit `01020b6` - "Dashboard Drag & Drop #7201: epic md file"
- 2025-08-21 @tobiu referenced in commit `57a5d97` - "#7201 switched drag-handles back to cursor pointer (important for e.g. tab header buttons)"
- 2025-11-19 @github-actions added the `stale` label

