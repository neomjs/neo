---
id: 8990
title: 'perf: Propagate silent flag to Component Column renderer to suppress scrolling updates'
state: CLOSED
labels:
  - ai
  - performance
  - core
assignees:
  - tobiu
createdAt: '2026-02-04T19:41:14Z'
updatedAt: '2026-02-04T19:47:52Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8990'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-04T19:47:52Z'
---
# perf: Propagate silent flag to Component Column renderer to suppress scrolling updates

## Context
The grid scrolling performance has degraded after the `Neo.grid.Row` refactor. Analysis points to a message flood caused by Component Columns.
When `grid.Body` scrolls, it updates rows silently (`createViewData(silent=true)`). However, `Neo.grid.Row` fails to propagate this `silent` flag to `cellRenderer`.
Consequently, `grid.column.Component` calls `component.set()` without the silent flag, triggering an individual VDOM update for every component cell in every row on every scroll frame (e.g., 50 rows = 50 extra updates/frame).

## Objective
Suppress individual component updates during the scrolling loop by propagating the `silent` flag.

## Changes
1.  **src/grid/Row.mjs:**
    *   Update `createVdom` to pass `silent` to `applyRendererOutput`.
    *   Update `applyRendererOutput` to accept `silent` and include it in the renderer `data` object.
2.  **src/grid/column/Component.mjs:**
    *   Update `cellRenderer` to accept `silent` from `data`.
    *   Use `component.set(config, silent)` to leverage `component.Abstract`'s silent update capability.

## Expected Result
Significant reduction in VDOM traffic during scrolling for grids with component columns, restoring performance.

## Timeline

- 2026-02-04T19:41:15Z @tobiu added the `performance` label
- 2026-02-04T19:41:15Z @tobiu added the `core` label
- 2026-02-04T19:41:31Z @tobiu added the `ai` label
- 2026-02-04T19:41:37Z @tobiu assigned to @tobiu
- 2026-02-04T19:46:57Z @tobiu referenced in commit `258be4e` - "perf: Propagate silent flag to Component Column renderer to suppress scrolling updates (#8990)"
### @tobiu - 2026-02-04T19:47:09Z

**Input from Gemini 3 Pro:**

> ✦ Implemented silent updates for Component Columns to fix scrolling performance regression.
> 
> **Changes:**
> 1.  **`src/grid/Row.mjs`:**
>     *   Updated `createVdom` to pass the `silent` flag (received from `Body.createViewData`) to `applyRendererOutput`.
>     *   Updated `applyRendererOutput` to include `silent` in the data object passed to `column.renderer`.
> 2.  **`src/grid/column/Component.mjs`:**
>     *   Updated `cellRenderer` to destructure `silent` from the data object.
>     *   Switched from `component.set(config)` to `component.set(config, silent)` to leverage the framework's native silent update capability.
> 
> This ensures that during scrolling, the 50+ recycled component instances update their internal state without triggering individual VDOM updates, relying instead on the single atomic VDOM update from the Grid Body.

- 2026-02-04T19:47:52Z @tobiu closed this issue

