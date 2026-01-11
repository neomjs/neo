---
id: 7023
title: Enhance `Neo.core.Config` for Robust Subscriptions with Scope
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-12T14:41:16Z'
updatedAt: '2025-07-12T14:42:01Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7023'
author: tobiu
commentsCount: 0
parentIssue: 6992
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-07-12T14:42:01Z'
---
# Enhance `Neo.core.Config` for Robust Subscriptions with Scope

**Summary:**
This ticket covers a critical enhancement to `Neo.core.Config` to add support for an execution `scope` in its `subscribe` method. This was driven by the need for functional components to safely observe `Neo.core.Effect` state changes without creating circular dependencies. The implementation evolved to handle complex edge cases, resulting in a more robust and powerful subscription system.

**Rationale:**
The initial problem was an infinite loop in functional components. The component's `vdomEffect` would trigger an update, which would read `this.vnode`, creating a dependency on the result of the update itself.

The chosen solution was to make `Effect.isRunning` a reactive `Neo.core.Config` and have the component subscribe to it. This required the subscription callback to be executed in the component's scope. The `Config.subscribe` method, however, lacked support for a `scope` parameter.

**Implementation Journey:**

1.  **Initial Goal:** Add a `scope` parameter to `subscribe`.
2.  **First Approach:** A simple implementation was considered, storing the `fn` and `scope` in a `Map`.
3.  **Identifying an Edge Case:** It was determined that subscribing the same function with different scopes would lead to silent overwrites (e.g., `map.set(fn, scopeA)` followed by `map.set(fn, scopeB)`).
4.  **Final Architecture:** To solve this robustly, a more sophisticated nested data structure was implemented: `Map<string, Map<function, Set<scope>>>`.
    *   The top-level `Map` keys are the subscriber owner's ID.
    *   The second-level `Map` keys are the callback functions.
    *   The `Set` stores all unique scopes registered for that specific function.
    This ensures that every `fn`-`scope` combination is treated as a unique subscription, preventing conflicts and data loss.
5.  **Intent-Driven Comments:** Due to the non-obvious complexity of the final data structure, detailed comments were added to `Config.mjs` to explain the *why* behind the design, ensuring future maintainability.

**Definition of Done:**
-   `Neo.core.Config.subscribe` now accepts a `scope` property.
-   The internal implementation correctly handles multiple subscriptions of the same function with different scopes.
-   The `notify` method correctly executes callbacks with their specified scope.
-   The cleanup function returned by `subscribe` correctly removes the specific `fn`/`scope` subscription and cleans up parent data structures if they become empty.
-   The code is documented with intent-driven comments explaining the data structure.

## Timeline

- 2025-07-12T14:41:16Z @tobiu assigned to @tobiu
- 2025-07-12T14:41:17Z @tobiu added the `enhancement` label
- 2025-07-12T14:41:52Z @tobiu referenced in commit `f9935e0` - "Enhance Neo.core.Config for Robust Subscriptions with Scope #7023"
- 2025-07-12T14:42:02Z @tobiu closed this issue
- 2025-07-12T18:29:12Z @tobiu added parent issue #6992

