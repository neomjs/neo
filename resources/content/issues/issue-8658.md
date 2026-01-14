---
id: 8658
title: 'Docs: Create ''Neural Timeline'' Architecture Guide'
state: OPEN
labels:
  - documentation
  - ai
assignees:
  - tobiu
createdAt: '2026-01-14T23:41:17Z'
updatedAt: '2026-01-14T23:50:18Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8658'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Docs: Create 'Neural Timeline' Architecture Guide

We are creating a new technical guide to document the "Neural Timeline" implementation.

**Goal:** Document the advanced "Coordinator Pattern" used to synchronize DOM elements (App Worker) with a physics-based Canvas visualization (Shared Worker).

**Content Strategy:**
1.  **The Coordinator Pattern:** Explain how `TimelineCanvas.mjs` (App Worker) acts as the "eyes" for the blind `TicketCanvas.mjs` (Shared Worker) by translating DOMRects into canvas coordinates.
2.  **Physics Engine:** Deep dive into the "Traffic Model" physics (acceleration/deceleration based on node proximity) and the "Squash & Stretch" visual effects.
3.  **Data-Driven Visuals:** Explain the "Chameleon Pulse" effect, where the animation color interpolates based on the semantic state of the nearest ticket (e.g., Red for Bugs).
4.  **Optimization:** Document the "Zombie Loop" prevention strategy (unmount cleanup) and the efficient use of `ResizeObserver`.

**Deliverables:**
-   New guide file: `learn/guides/advanced/NeuralTimeline.md`.
-   Update `learn/tree.json` to include the new guide under the "Advanced Architecture" section.


## Timeline

- 2026-01-14T23:41:18Z @tobiu added the `documentation` label
- 2026-01-14T23:41:18Z @tobiu added the `ai` label
- 2026-01-14T23:50:18Z @tobiu assigned to @tobiu

