---
id: 8903
title: Implement Scoped Deterministic IDs for Functional Components
state: CLOSED
labels:
  - enhancement
  - ai
  - core
assignees:
  - tobiu
createdAt: '2026-01-28T17:08:51Z'
updatedAt: '2026-01-28T17:35:10Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8903'
author: tobiu
commentsCount: 1
parentIssue: 8899
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-28T17:35:10Z'
---
# Implement Scoped Deterministic IDs for Functional Components

**Objective:**
Implement "Scoped Deterministic ID Generation" for Functional Components to ensure stable, persistent identities across re-renders without relying on Worker state.

**Problem:**
Functional Components currently generate stateless VDOMs. With the new "App Authority" model, `TreeBuilder` assigns random IDs on every render, causing full-tree replacements on updates.

**Strategy: Scoped Deterministic IDs**
We will implement a generator that assigns IDs based on structure and hierarchy.
1.  **Prefix-Based:** IDs are generated as `prefix + '__' + index`.
2.  **Scoping:**
    -   Start with the Component ID as the base prefix.
    -   If a node has a **Custom ID** (developer provided), use THAT ID as the **New Prefix** for its descendants.
    -   Reset the index counter for the new scope.
3.  **Result:** Adding an `id` to a container "shields" its children from index shifts in the parent container. Moving the container moves the whole stable sub-tree.

**Implementation:**
1.  **Modify `src/functional/component/Base.mjs`**:
    - Implement `generateIds(vdom, prefix)` method (or helper).
    - Call this in `continueUpdateWithVdom` *before* `processVdomForComponents`.
2.  **Algorithm:**
    -   Traverse VDOM.
    -   Maintains a `Map<Prefix, Counter>`.
    -   For each node:
        -   If `id` exists: Use it. Update `currentPrefix = node.id`.
        -   If `id` missing: `node.id = currentPrefix + '__' + counter++`.
        -   Recurse.

**Impact:**
-   **Static Stability:** Static structures get identical IDs every time.
-   **Optimization:** Developers can optimize dynamic lists/containers simply by adding IDs.
-   **Independence:** Fully decouples App Worker from VDOM Worker state.


## Timeline

- 2026-01-28T17:08:52Z @tobiu added the `enhancement` label
- 2026-01-28T17:08:52Z @tobiu added the `ai` label
- 2026-01-28T17:08:53Z @tobiu added the `core` label
- 2026-01-28T17:09:03Z @tobiu added parent issue #8899
- 2026-01-28T17:15:40Z @tobiu referenced in commit `01151c5` - "feat: Implement Scoped Deterministic ID Generation for Functional Components (Ticket #8903)"
### @tobiu - 2026-01-28T17:15:43Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the "Scoped Deterministic ID Generation" strategy.
> 
> **Changes:**
> 1.  **Modified `src/functional/component/Base.mjs`:**
>     -   Implemented `generateIds(vdom, prefix, scopeMap)`:
>         -   Traverses the VDOM tree.
>         -   Uses custom `id` as a new prefix (scope) if present.
>         -   Generates `prefix + '__' + index` if `id` is missing.
>     -   Updated `continueUpdateWithVdom` to call `generateIds` instead of the obsolete `syncVdomState`.
> 
> **Verification:**
> -   `Button.spec.mjs` (Functional Component) passed. Delta counts match expectations (1 delta for text update), confirming ID stability.
> -   All 256 Unit Tests passed.
> 
> **Outcome:**
> Functional components now have stable, persistent IDs for static structures and keyed sub-trees, without relying on the VDOM Worker's state. This aligns perfectly with the "App Authority" architecture.

- 2026-01-28T17:19:22Z @tobiu cross-referenced by #8904
- 2026-01-28T17:35:09Z @tobiu assigned to @tobiu
- 2026-01-28T17:35:10Z @tobiu closed this issue

