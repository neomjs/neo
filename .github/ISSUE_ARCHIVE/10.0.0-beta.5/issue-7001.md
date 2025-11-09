---
id: 7001
title: Granular Cloning Strategies for `core.Config`
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-09T17:20:05Z'
updatedAt: '2025-07-09T17:33:35Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7001'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-07-09T17:33:35Z'
---
# Granular Cloning Strategies for `core.Config`

**Reported by:** @tobiu on 2025-07-09

## Problem

Currently, the cloning behavior for reactive configs (`_`) is managed with hardcoded exceptions within `Neo.mjs#autoGenerateGetSet`. Specifically, the `items` and `vnode` configs are excluded from the standard deep cloning process. This approach is inflexible and not scalable. Adding new configs with special cloning requirements would require modifying the core `Neo.mjs` module, which is undesirable.

## Solution

To address this, we will introduce two new properties to the `Neo.core.Config` class descriptor to provide fine-grained control over cloning behavior on a per-config basis.

1.  **`clone`**: A string property that dictates the cloning strategy when a config value is **set**.
    *   `'deep'` (default): Performs a deep clone.
    *   `'shallow'`: Performs a shallow clone.
    *   `'none'`: Assigns the value by reference.

2.  **`cloneOnGet`**: A string property that dictates the cloning strategy when a config value is **retrieved** via its getter. This provides crucial control over whether external code receives a reference to internal state or a safe copy.
    *   `'deep'`: Returns a deep clone of the value.
    *   `'shallow'`: Returns a shallow clone of the value.
    *   `'none'`: Returns the value by reference.

### Backward Compatibility and Defaulting Rationale

A critical requirement is to introduce this feature without causing regressions. The framework has an established, albeit implicit, getter behavior:
- **Arrays** are returned as a shallow copy (`[...value]`).
- **Objects** are returned by reference.

Changing this default behavior would risk breaking existing code. Therefore, the new `cloneOnGet` property will be **strictly opt-in**.

- **`cloneOnGet` will default to `null`**.
- The getter logic in `Neo.mjs#autoGenerateGetSet` will check for the presence of this config.
  - If `cloneOnGet` is `null`, the **exact legacy behavior** will be applied.
  - If `cloneOnGet` is explicitly set to `'deep'`, `'shallow'`, or `'none'`, the new logic will be used.

This ensures that the new system is non-destructive. We can then incrementally update specific config descriptors (e.g., for `items`) to use the new flags without affecting any other part of the framework.

