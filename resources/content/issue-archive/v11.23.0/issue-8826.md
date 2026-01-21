---
id: 8826
title: 'Refine VDOM Update Architecture: Decouple Collision Blocking from Merge Optimization'
state: CLOSED
labels:
  - refactoring
  - architecture
  - core
assignees:
  - tobiu
createdAt: '2026-01-20T11:21:56Z'
updatedAt: '2026-01-20T11:23:10Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8826'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-20T11:23:10Z'
---
# Refine VDOM Update Architecture: Decouple Collision Blocking from Merge Optimization

This task formalizes the architectural refinement of the VDOM Update engine introduced during the resolution of Race Conditions (#8814) and Test Regressions (#8823).

**Architectural Shift:**
Previously, VDOM update logic relied on a single check (`hasUpdateCollision`) to determine both *safety* (should we block?) and *optimization* (should we merge?). This ambiguity led to trade-offs between race conditions (too permissive) and missed bundling opportunities (too strict).

**The Solution: Decoupling Logic**
We have split the logic into two distinct, purpose-built methods in `VdomLifecycle`:

1.  **Safety (`hasUpdateCollision` with `<`):**
    *   **Goal:** Prevent destructive parallel updates.
    *   **Logic:** A Parent (Depth 1) does *not* collide with a Child (Distance 1) because the Parent's VDOM prunes the Child.
    *   **Result:** Enforces strict scoped updates and prevents blocking valid parallel execution.

2.  **Optimization (`canMergeUpdate` with `<=`):**
    *   **Goal:** Enable efficient bundling of updates to reduce worker messages.
    *   **Logic:** If a Parent is *already* updating (or dirty), it *can* safely absorb a Child (Distance 1) update into its cycle.
    *   **Result:** Restores the ability to bundle updates (e.g., `setSilent` transactions) without compromising safety.

**Impact:**
*   **Robustness:** Eliminates "Duplicate Node" race conditions.
*   **Performance:** Maintains disjoint, parallel updates for independent components.
*   **Efficiency:** Preserves update bundling when components update together in a transaction.

This architecture serves as the foundation for the v11 VDOM engine.

## Timeline

- 2026-01-20T11:21:57Z @tobiu added the `refactoring` label
- 2026-01-20T11:21:57Z @tobiu added the `architecture` label
- 2026-01-20T11:21:58Z @tobiu added the `core` label
- 2026-01-20T11:22:13Z @tobiu assigned to @tobiu
- 2026-01-20T11:23:10Z @tobiu closed this issue

