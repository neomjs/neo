---
id: 8657
title: 'Docs: Create ''Advanced Canvas Architecture'' Guide'
state: CLOSED
labels:
  - documentation
  - ai
assignees:
  - tobiu
createdAt: '2026-01-14T23:21:00Z'
updatedAt: '2026-01-14T23:36:47Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8657'
author: tobiu
commentsCount: 1
parentIssue: 8630
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-14T23:36:47Z'
---
# Docs: Create 'Advanced Canvas Architecture' Guide

We are creating a new technical guide to document the advanced "Header Canvas" implementation.

**Goal:** showcase the "Luminous Flux" visual engine as a prime example of Neo.mjs's high-performance architecture.

**Content Strategy:**
1.  **Architecture:** Explain the split topology:
    -   **App Worker (`Portal.view.HeaderCanvas`):** DOM synchronization, lifecycle, input bridging.
    -   **Shared Worker (`Portal.canvas.HeaderCanvas`):** Physics engine, rendering loop, zero-allocation strategy.
2.  **Performance:** Deep dive into the "Zero-Allocation" rendering loop (TypedArrays, gradient caching) to explain how we achieve 60fps without GC stutters.
3.  **Visuals:** Breakdown of the "Luminous Flux" theme (Ribbons, Neon Tubes, Particles, Shockwaves).
4.  **Integration:** How the overlay interacts with the existing UI (event forwarding, rect tracking).

**Deliverables:**
-   New guide file: `learn/guides/advanced/CanvasArchitecture.md` (or similar).
-   Update `learn/tree.json` to include the new guide under a new "Advanced Architecture" or "Canvas" section.


## Timeline

- 2026-01-14T23:21:02Z @tobiu added the `documentation` label
- 2026-01-14T23:21:02Z @tobiu added the `ai` label
- 2026-01-14T23:35:07Z @tobiu assigned to @tobiu
- 2026-01-14T23:35:22Z @tobiu added parent issue #8630
- 2026-01-14T23:36:26Z @tobiu referenced in commit `0bad636` - "docs: Add Advanced Canvas Architecture guide (#8657)"
### @tobiu - 2026-01-14T23:36:31Z

**Input from Gemini 3 Pro:**

> ✦ I have created the "Advanced: Zero-Allocation Effects with Shared Workers" guide. It covers:
> - **Architecture:** App Worker <-> Shared Worker topology.
> - **Zero-Allocation:** Strategies for GC-free rendering.
> - **Visual Engine:** Deep dive into the "Luminous Flux" theme logic.
> - **Practical Implementation:** Setup steps, pitfalls, and usage guidelines.
> 
> The guide is located at `learn/guides/advanced/CanvasArchitecture.md` and has been added to the documentation tree.

- 2026-01-14T23:36:47Z @tobiu closed this issue

