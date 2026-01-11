---
id: 6964
title: 'Feature: Introduce Neo.core.Effect and Neo.core.EffectManager for reactive computations'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-06T18:39:57Z'
updatedAt: '2025-10-22T22:56:58Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6964'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-07-06T18:55:19Z'
---
# Feature: Introduce Neo.core.Effect and Neo.core.EffectManager for reactive computations

Exploration quest inside the `effect-based-state-provider` feature branch

**Description**

This feature introduces a new, foundational reactive primitive to the Neo.mjs framework: `Neo.core.Effect`. This class provides a generic mechanism for defining computations that automatically re-run whenever their underlying dependencies change. To enable dynamic dependency tracking, a singleton `Neo.core.EffectManager` is also introduced.

**Motivation**

As the framework evolves, there's a growing need for a standardized, efficient, and robust way to handle reactive computations. Instead of implementing custom reactivity logic in various parts of the codebase, a core `Effect` primitive allows for:

*   **Consistency:** A single, unified approach to reactivity across the framework.
*   **Efficiency:** A lightweight implementation designed for performance.
*   **Reusability:** A building block for more complex reactive features (e.g., computed properties, advanced data bindings).
*   **Maintainability:** Centralizing reactivity logic makes it easier to understand, debug, and extend.

**Implementation Details**

1.  **`Neo.core.Effect` (New Class: `src/core/Effect.mjs`):**
    *   A plain JavaScript class (does not extend `Neo.core.Base`) to ensure maximum performance and minimal overhead.
    *   Wraps a function (`fn`) that represents the reactive computation.
    *   Automatically tracks `Neo.core.Config` instances accessed during `fn`'s execution as dependencies.
    *   Subscribes to changes in these dependencies and re-runs `fn` automatically when a dependency's value changes.
    *   Manages its own lifecycle, including cleaning up subscriptions when destroyed.

2.  **`Neo.core.EffectManager` (New Singleton: `src/core/EffectManager.mjs`):**
    *   A singleton object responsible for managing the context of currently running effects.
    *   Uses a stack (`effectStack`) to keep track of which `Effect` is active.
    *   Provides methods (`push`, `pop`, `getActiveEffect`) to allow reactive properties (like `Neo.core.Config`) to identify the currently running effect and register themselves as dependencies.
    *   Adheres to the "one class per file" principle for better modularity.

**Benefits**

*   Provides a powerful, generic primitive for building reactive features.
*   Improves the overall consistency and maintainability of the framework's reactivity model.
*   Lays the groundwork for future enhancements in data binding, computed properties, and state management.

## Timeline

- 2025-07-06T18:39:57Z @tobiu assigned to @tobiu
- 2025-07-06T18:39:58Z @tobiu added the `enhancement` label
- 2025-07-06T18:55:04Z @tobiu referenced in commit `8b2eb13` - "Feature: Introduce Neo.core.Effect and Neo.core.EffectManager for reactive computations #6964"
- 2025-07-06T18:55:19Z @tobiu closed this issue
- 2025-07-09T00:10:49Z @tobiu referenced in commit `8fec0ab` - "Feature: Introduce Neo.core.Effect and Neo.core.EffectManager for reactive computations #6964"

