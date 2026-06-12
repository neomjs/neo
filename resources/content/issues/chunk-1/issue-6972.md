---
id: 6972
title: Enhance `createHierarchicalDataProxy` to Support Reactive Non-Leaf Nodes
state: CLOSED
labels:
  - enhancement
  - help wanted
  - good first issue
  - no auto close
  - hacktoberfest
assignees: []
createdAt: '2025-07-07T11:20:46Z'
updatedAt: '2026-06-03T01:25:33Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6972'
author: tobiu
commentsCount: 3
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-06-03T01:25:33Z'
---
# Enhance `createHierarchicalDataProxy` to Support Reactive Non-Leaf Nodes

**Description:**

The current implementation of the hierarchical data proxy only creates reactive `core.Config` atoms for the leaf nodes of the state tree. While this approach is highly performant and granular, it has two significant limitations:

1.  **Inability to Observe Sub-Trees:** It is not possible to create an effect that reacts to any arbitrary change within a nested object (e.g., an effect on `data.user` does not re-run when `data.user.name` changes).
2.  **Problematic Atomic Replacements:** Atomically replacing an entire branch of the state (e.g., `data.user = { ... }`) does not work as expected, as it orphans the old `Config` atoms instead of triggering updates.

This feature request proposes enhancing the system to support "Full-Tree Reactivity," where every node in the state tree (both branches and leaves) is a reactive atom.

**Benefits:**

*   **Intuitive Reactivity:** Developers could subscribe to any part of the state tree, and changes would propagate as expected.
*   **Powerful State Patterns:** Would enable atomic sub-tree replacements and simplify state management logic.
*   **Improved Developer Experience:** Aligns the state manager with modern reactive principles, making it more powerful and easier to use.

**Considerations:**

*   This is a complex enhancement that will require careful implementation to manage performance.
*   A "notification bubbling" system will be needed to ensure changes in leaf nodes correctly trigger effects subscribed to parent nodes.

Implementing this feature would be a major step forward for the Neo.mjs state management system, providing a more robust and developer-friendly experience.

## Timeline

- 2025-07-07T11:20:47Z @tobiu added the `enhancement` label
### @github-actions - 2025-10-06T02:42:13Z

This issue is stale because it has been open for 90 days with no activity.

- 2025-10-06T02:42:13Z @github-actions added the `stale` label
- 2025-10-08T09:41:16Z @tobiu removed the `stale` label
- 2025-10-08T09:41:16Z @tobiu added the `no auto close` label
### @tobiu - 2025-10-08T09:41:44Z

this one needs a review. might be that it is already implemented.

- 2025-10-08T09:41:54Z @tobiu added the `help wanted` label
- 2025-10-08T09:41:54Z @tobiu added the `good first issue` label
- 2025-10-08T09:41:54Z @tobiu added the `hacktoberfest` label
### @neo-gpt - 2026-06-03T01:25:27Z

**Input from GPT-5 (Codex Desktop):**

> ● ## Closeout — implemented in current StateProvider substrate
> 
> Closing this as completed after live V-B-A against current source and tests.
> 
> Evidence checked:
> - `src/state/Provider.mjs` now creates/updates parent configs while setting nested leaf paths. The `internalSetData()` JSDoc explicitly describes bubbling reactivity for paths like `user.name`, and the implementation rebuilds parent object references up the path so effects depending on `data.user` / `data.level1` re-run.
> - `setData()` with nested objects deep-merges by recursively setting leaf paths instead of replacing/orphaning the old branch.
> - `test/playwright/unit/state/ProviderNestedDataConfigs.spec.mjs` directly covers the two original limitations:
>   - parent/subtree effects rerun when nested leaves change;
>   - nested object `setData({user: {firstname}})` preserves sibling fields and bubbles reactivity;
>   - deep nested bindings/formulas and parent-child providers also bubble correctly.
> - `test/playwright/unit/state/createHierarchicalDataProxy.spec.mjs` still covers the proxy resolution layer for nested data and parent providers.
> 
> Verification run:
> 
> ```text
> npm run test-unit -- test/playwright/unit/state/ProviderNestedDataConfigs.spec.mjs test/playwright/unit/state/createHierarchicalDataProxy.spec.mjs
> # 11 passed
> ```
> 
> The original feature request's full-tree/subtree reactivity behavior is present and covered, so keeping this open would now duplicate shipped state-provider behavior.

- 2026-06-03T01:25:33Z @neo-gpt closed this issue

