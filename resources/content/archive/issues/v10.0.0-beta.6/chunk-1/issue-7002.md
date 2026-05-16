---
id: 7002
title: 'Refactor: Move `core.Config` Defaults to Prototype'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-09T17:34:12Z'
updatedAt: '2025-07-10T12:02:27Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7002'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-07-10T12:02:27Z'
---
# Refactor: Move `core.Config` Defaults to Prototype

## Problem

The `Neo.core.Config` class currently assigns default values for `clone`, `cloneOnGet`, `isEqual`, and `mergeStrategy` directly on each instance within its constructor or through class field initializers.

In a large-scale application, there can be tens of thousands of `Config` instances. Assigning these properties to every instance, even when they hold default values, leads to significant and unnecessary memory consumption. Each instance stores its own copy of the property keys and pointers to the values, creating considerable overhead.

## Solution

To optimize memory usage and instantiation performance, we will refactor the `Config` class to leverage JavaScript's prototype chain.

1.  **Define Defaults on Prototype**: The default values for `clone`, `cloneOnGet`, `isEqual`, and `mergeStrategy` will be defined once on `Neo.core.Config.prototype`.

2.  **Conditional Instance Assignment**: The `initDescriptor` method will be modified to only set a property on the instance (`this`) if a config descriptor provides a value that is different from the prototype's default.

## Benefits

*   **Reduced Memory Footprint**: Instances will no longer store properties for default values. The memory overhead will be near-zero for the vast majority of configs that use the defaults.
*   **Faster Instantiation**: The `Config` constructor will perform less work, leading to faster object creation, which is beneficial when creating many components dynamically.

This is a standard JavaScript optimization that is critical for the performance of a core framework component like `Config`.

## Timeline

- 2025-07-09T17:34:12Z @tobiu assigned to @tobiu
- 2025-07-09T17:34:13Z @tobiu added the `enhancement` label
- 2025-07-09T17:52:15Z @tobiu referenced in commit `45e8800` - "Refactor: Move core.Config Defaults to Prototype #7002"
- 2025-07-10T12:02:27Z @tobiu closed this issue

