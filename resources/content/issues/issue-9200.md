---
id: 9200
title: 'Optimization: Record Versioning & Component Column Short-Circuit'
state: CLOSED
labels:
  - enhancement
  - performance
  - core
assignees:
  - tobiu
createdAt: '2026-02-17T15:02:10Z'
updatedAt: '2026-02-19T12:50:43Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9200'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-19T12:50:43Z'
---
# Optimization: Record Versioning & Component Column Short-Circuit

### Objective
Implement a "Record Versioning" mechanism to allow `Neo.grid.column.Component` to short-circuit redundant updates during rendering, optimizing horizontal scrolling and grid updates.

### Motivation
In `Neo.grid.Row` pooling, component instances are reused. When a row recycles (or during horizontal scroll when a column re-appears), `cellRenderer` is called, which triggers `component.set(config)`. Even if the record hasn't changed, this often triggers VDOM updates because `config` objects (like arrays for sparklines) are new references.

### Implementation Plan
1.  **`Neo.data.RecordFactory`**:
    *   Add a `_version` (integer) property to the generated Record class.
    *   Increment `_version` inside `setRecordFields` whenever a field actually changes.
    *   Expose a `version` getter.

2.  **`Neo.grid.column.Component`**:
    *   In `cellRenderer`, check if an existing `component` instance is being reused.
    *   **Short-Circuit Condition**: If `component[recordProperty] === record` AND `record.version === component.lastRecordVersion`.
    *   If condition met: **Return early** (skip `component.set()`).
    *   Else: Proceed with update and store `component.lastRecordVersion = record.version`.

### Expected Impact
Significant reduction in scripting time during horizontal scrolling and redundant store updates, especially for grids with complex component columns.

## Timeline

- 2026-02-17T15:02:11Z @tobiu added the `enhancement` label
- 2026-02-17T15:02:12Z @tobiu added the `performance` label
- 2026-02-17T15:02:12Z @tobiu added the `core` label
- 2026-02-17T19:01:55Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-19T11:19:16Z

**Input from Gemini 3 Pro:**

> ✦ ### Strategic Clarification: The "Green Software" Impact
> 
> While limiting VDOM traffic is valuable, the primary driver for this optimization is reducing **CPU and Memory overhead** in the App Worker.
> 
> Currently, `Neo.grid.column.Component#cellRenderer` executes the following chain for **every cell** on **every scroll frame**, even if the data is identical:
> 1.  **Allocation:** Creates a new `componentConfig` object.
> 2.  **Execution:** Calls `component.set()`, which triggers property iteration, getter resolution, and value comparison inside `Neo.core.Config`.
> 
> **The Optimization:**
> By checking `record.version` *before* this chain starts, we short-circuit the entire process.
> -   **0 Allocations**
> -   **0 Config System Lookups**
> 
> This is a pure "Green Software" optimization. When multiplied by 50 rows × 20 columns × 60 FPS, eliminating these "cheap" cycles significantly reduces thermal pressure and battery drain, ensuring the App Worker remains responsive for critical logic.

- 2026-02-19T12:50:17Z @tobiu referenced in commit `964af82` - "feat: Implement Record Versioning & Grid Component Optimization (#9200)

Introduces a `version` property on Records that increments on field changes. Updates `Neo.grid.column.Component` to short-circuit updates when the record version is unchanged, significantly reducing overhead for component columns during scrolling."
### @tobiu - 2026-02-19T12:50:22Z

**Input from Gemini 3 Pro:**

> ✦ Implemented Record Versioning and Grid Component Column optimization.
> 
> **Changes:**
> 1.  **`Neo.data.RecordFactory`**: Added a `version` property to records. This integer increments whenever a record field is modified (via `set()` or property assignment).
> 2.  **`Neo.grid.column.Component`**: Updated `cellRenderer` to check `record.version`. If the component instance is being recycled for the *same* record and the *same* version, the method now returns early. This skips the execution of the `component` config factory function and avoids the overhead of `component.set()`.
> 3.  **Tests**: Added unit tests for both `RecordFactory` versioning logic and the `Component` column optimization pattern.
> 
> This change significantly reduces CPU usage during grid scrolling and redundant store updates, particularly for grids with complex component columns (like Sparklines or Heuristics).

- 2026-02-19T12:50:43Z @tobiu closed this issue
- 2026-02-19T12:52:01Z @tobiu cross-referenced by #9210

