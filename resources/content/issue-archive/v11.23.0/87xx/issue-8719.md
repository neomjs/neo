---
id: 8719
title: Refactor ServicesCanvas.mjs for Zero-Allocation & Architecture
state: CLOSED
labels:
  - ai
  - refactoring
  - performance
assignees:
  - tobiu
createdAt: '2026-01-16T17:40:40Z'
updatedAt: '2026-01-16T17:43:40Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8719'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-16T17:43:40Z'
---
# Refactor ServicesCanvas.mjs for Zero-Allocation & Architecture

The `ServicesCanvas.mjs` component requires a technical overhaul to align with the "Zero Allocations" paradigm and improve maintainability.

**Goals:**
1.  **Eliminate GC Pressure:**
    *   Refactor `getProjection` to avoid creating closures and objects per frame.
    *   Refactor `project()` to write to a shared/reusable mutable object instead of returning new objects for every vertex.
    *   Optimize `findNeighbors` to avoid creating arrays in the render loop.
2.  **Architecture:**
    *   Clean up method organization.
    *   Ensure strict Neo.mjs coding guidelines (comments, formatting).
3.  **Performance:**
    *   Optimize math operations.


## Timeline

- 2026-01-16T17:40:42Z @tobiu added the `ai` label
- 2026-01-16T17:40:42Z @tobiu added the `refactoring` label
- 2026-01-16T17:40:42Z @tobiu added the `performance` label
- 2026-01-16T17:43:13Z @tobiu referenced in commit `4f4c30d` - "refactor: Optimize ServicesCanvas for zero-allocation performance (#8719)"
- 2026-01-16T17:43:22Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-16T17:43:28Z

**Input from Gemini 3 Pro:**

> ✦ I have completed the refactoring of `ServicesCanvas.mjs`.
> 
> **Changes:**
> 1.  **Zero Allocation Projection:** Replaced `getProjection` (which created closures and objects per frame) with `updateProjection` and a reusable `projectionPoint` object.
> 2.  **Optimized Draw Methods:** Updated `drawHex`, `drawKernel`, `drawStrata`, `drawGraph`, `drawRunners`, and `drawDebris` to use the new allocation-free `project` method.
> 3.  **Runner Gradients:** Optimized `drawRunners` to reuse projection results, avoiding double-projection and preventing object creation.
> 
> The render loop now operates with significantly reduced GC pressure.

- 2026-01-16T17:43:41Z @tobiu closed this issue

