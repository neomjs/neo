---
id: 9200
title: 'Optimization: Record Versioning & Component Column Short-Circuit'
state: OPEN
labels:
  - enhancement
  - performance
  - core
assignees: []
createdAt: '2026-02-17T15:02:10Z'
updatedAt: '2026-02-17T15:02:10Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9200'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
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

