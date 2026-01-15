---
id: 8651
title: Optimize HeaderCanvas Rendering (GC & Gradients)
state: CLOSED
labels:
  - ai
  - refactoring
  - performance
assignees:
  - tobiu
createdAt: '2026-01-14T19:32:19Z'
updatedAt: '2026-01-14T19:36:05Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8651'
author: tobiu
commentsCount: 1
parentIssue: 8630
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-14T19:36:05Z'
---
# Optimize HeaderCanvas Rendering (GC & Gradients)

Optimize `apps/portal/canvas/HeaderCanvas.mjs` to reduce Garbage Collection (GC) pressure and improve rendering performance, inspired by the efficiency of `TicketCanvas.mjs`.

**Identified Issues:**
1.  **Object Allocation Churn:** `calculateStrandPoints` and `drawAmbientBackground` allocate new arrays and thousands of `{x, y}` object literals *every frame* (60fps). This causes significant GC overhead.
2.  **Redundant Gradient Creation:** `createLinearGradient` is called every frame with identical parameters (0 to width), creating unnecessary objects.

**Optimization Plan:**
1.  **Gradient Caching:** Move gradient creation to `updateSize` (or lazy-init with cache). Recreate only when dimensions change.
2.  **TypedArray Buffers:** Replace array-of-objects with `Float32Array` buffers to store wave geometry.
    - Implement `this.waveBuffer` (e.g., holding Y values).
    - Reuse these buffers every frame, eliminating per-frame object allocation entirely for the main loops.

**Target:** Zero per-frame allocation for the core render loop.

## Timeline

- 2026-01-14T19:32:20Z @tobiu added the `ai` label
- 2026-01-14T19:32:20Z @tobiu added the `refactoring` label
- 2026-01-14T19:32:20Z @tobiu added the `performance` label
- 2026-01-14T19:32:44Z @tobiu added parent issue #8630
- 2026-01-14T19:35:25Z @tobiu referenced in commit `f17ae21` - "perf: Optimize HeaderCanvas rendering (GC and Gradient caching) (#8651)"
- 2026-01-14T19:35:37Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-14T19:35:50Z

**Input from Gemini 3 Pro:**

> ✦ Refactored `HeaderCanvas` for maximum performance:
> 1.  **Gradient Caching:** Gradients (`grad1`, `bgRibbon`, etc.) are now cached in `this.gradients` and only recreated on resize, instead of every frame.
> 2.  **Zero-Allocation Loop:** Replaced per-frame `{x, y}` object allocation with `Float32Array` buffers (`this.waveBuffers`) for wave geometry. This eliminates thousands of objects per second from the GC cycle.
> 3.  **Refactored Logic:** Updated `calculateStrandGeometry` and `drawAmbientBackground` to write directly to these buffers.
> 
> This brings `HeaderCanvas` up to the high-performance standard of `TicketCanvas`.

- 2026-01-14T19:36:05Z @tobiu closed this issue

