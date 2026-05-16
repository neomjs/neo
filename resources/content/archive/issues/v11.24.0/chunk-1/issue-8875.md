---
id: 8875
title: 'Test: Verify Wrapper Node Lifecycle and ID Changes'
state: CLOSED
labels:
  - ai
  - testing
  - regression
assignees:
  - tobiu
createdAt: '2026-01-24T13:58:21Z'
updatedAt: '2026-01-24T14:17:30Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8875'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-24T14:17:30Z'
---
# Test: Verify Wrapper Node Lifecycle and ID Changes

**Description:**
Recent optimizations to `ComponentManager.unregister` refactored wrapper node cleanup. We need to ensure that wrapper nodes are correctly managed during the entire component lifecycle, especially during destruction and ID changes.

**Goals:**
1.  **Verify Unregister Cleanup:** Ensure `ComponentManager.wrapperNodes` does not retain references to destroyed components.
2.  **Verify ID Change Handling:** When a component's `id` is changed via `set({id: 'newId'})`:
    *   Ensure the old wrapper ID entry is removed from `wrapperNodes`.
    *   Ensure the new wrapper ID entry is added.
    *   Ensure `childMap` is updated correctly.
3.  **Verify ChildMap Integration:** Ensure wrapped components are correctly tracked in the new O(1) reverse map.

**Proposed Test File:** `test/playwright/unit/component/WrapperLifecycle.spec.mjs`

**Scenarios:**
*   Create a component with a wrapper node.
*   Verify registration in `wrapperNodes` and `childMap`.
*   Change ID. Verify consistency.
*   Destroy. Verify cleanup of both maps.

## Timeline

- 2026-01-24T13:58:23Z @tobiu added the `ai` label
- 2026-01-24T13:58:23Z @tobiu added the `testing` label
- 2026-01-24T13:58:23Z @tobiu added the `regression` label
- 2026-01-24T14:16:05Z @tobiu referenced in commit `1177058` - "test: Verify Wrapper Node Lifecycle and ID Changes (#8875)"
- 2026-01-24T14:16:16Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-24T14:17:10Z

**Input from Gemini 3 Pro:**

> ✦ I have addressed the objectives of this ticket by:
> 
> 1.  **Creating a robust verification test:** `test/playwright/unit/component/WrapperLifecycle.spec.mjs` was implemented to specifically target wrapper node registration, ID changes, and cleanup.
> 2.  **Fixing a wrapper cleanup bug:** The test revealed that `ComponentManager.unregister` was failing to delete wrapper nodes when called with a string ID (e.g., during an ID change). I refactored `unregister` to ensure wrapper cleanup logic executes regardless of the input type (string or object).
> 3.  **Refactoring for Optimization and Safety:** The `unregister` method was further refined to use safe destructuring (`const {id, parentId} = component || {}`) and a cleaner flow, removing redundant checks and nested logic.
> 4.  **Enhancing Documentation:** I added intent-driven JSDoc to `ComponentManager` (`childMap`, `getDirectChildren`, `register`, `unregister`, `onParentIdChange`) and the test file to ensure the purpose of these mechanisms is clear for future maintenance.
> 5.  **Stabilizing Unit Tests:** I renamed test classes in `ParentIdChange.spec.mjs` and `WrapperLifecycle.spec.mjs` to unique namespaces to prevent global scope collisions that were causing flaky regressions in `HiddenChildren.spec.mjs`.
> 
> The implementation is now stable, optimized, and covered by regression tests.

- 2026-01-24T14:17:30Z @tobiu closed this issue

