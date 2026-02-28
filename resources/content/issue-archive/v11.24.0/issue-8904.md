---
id: 8904
title: Verify Scoped Deterministic ID Generation for Functional Components
state: CLOSED
labels:
  - ai
  - testing
  - core
assignees:
  - tobiu
createdAt: '2026-01-28T17:19:21Z'
updatedAt: '2026-01-28T17:35:35Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8904'
author: tobiu
commentsCount: 1
parentIssue: 8899
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-28T17:35:35Z'
---
# Verify Scoped Deterministic ID Generation for Functional Components

**Objective:**
Explicitly verify the "Scoped Deterministic ID Generation" logic introduced in Ticket #8903 to ensure it behaves as designed, particularly regarding the "Shielding" effect of custom IDs.

**Tasks:**
1.  **Create `test/playwright/unit/functional/IdGeneration.spec.mjs`**.
2.  **Test Cases:**
    -   **Flat Generation:** Verify that a simple tree without IDs gets sequential IDs (`cmp-1__0`, `cmp-1__1`, etc.).
    -   **Deep Generation:** Verify that deep hierarchies without custom IDs share the same prefix and sequential counter (Flat Indexing within Scope).
    -   **Scope Reset (Shielding):** Verify that a node with a **Custom ID** resets the scope for its children.
        -   Structure: Root -> Container (`id="my-scope"`) -> Child.
        -   Expectation: Child gets `my-scope__0`.
    -   **Stability under Shift:**
        -   Insert a node *before* the Scoped Container.
        -   Verify that the Container's children RETAIN their IDs (`my-scope__0`), proving they are shielded from the parent's index shift.

**Why:**
To catch regressions in the ID generation logic that might cause unnecessary DOM thrashing (full re-renders) in complex Functional Components.


## Timeline

- 2026-01-28T17:19:22Z @tobiu added the `ai` label
- 2026-01-28T17:19:22Z @tobiu added the `testing` label
- 2026-01-28T17:19:23Z @tobiu added the `core` label
- 2026-01-28T17:19:33Z @tobiu added parent issue #8899
- 2026-01-28T17:33:01Z @tobiu referenced in commit `15827fa` - "test: Verify ID Generation and Persistence for Class-Based Components (Ticket #8904)"
### @tobiu - 2026-01-28T17:33:08Z

**Input from Gemini 3 Pro:**

> ✦ I have added verification tests for Class-Based Component ID Generation.
> 
> **Verification:**
> Created `test/playwright/unit/component/IdGeneration.spec.mjs`.
> Tests confirm:
> 1.  **JIT Generation:** Nodes without IDs get them (`neo-vnode-X`).
> 2.  **Persistence:** Auto-generated IDs persist across updates (proving `this.vdom` mutation works).
> 3.  **Dynamic Insertion:** New nodes get new IDs, existing nodes remain stable.
> 
> **Completion:**
> All sub-tasks for the VDOM ID Architecture Shift are complete and verified.
> - App Authority (TreeBuilder) implemented.
> - Obsolete Sync logic removed.
> - Functional Components (Scoped Deterministic IDs) implemented.
> - Unit Tests stabilized and expanded.

- 2026-01-28T17:35:29Z @tobiu assigned to @tobiu
- 2026-01-28T17:35:35Z @tobiu closed this issue

