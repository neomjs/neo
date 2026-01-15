---
id: 8661
title: 'Epic: Home Hero Canvas (Neural Connectome)'
state: OPEN
labels:
  - enhancement
  - epic
  - ai
assignees:
  - tobiu
createdAt: '2026-01-15T01:05:08Z'
updatedAt: '2026-01-15T01:05:08Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8661'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues:
  - '[x] 8662 Scaffold Home Canvas Architecture'
  - '[x] 8663 Implement Neural Network Physics & Rendering'
  - '[x] 8664 Implement Home Canvas Interaction & Parallax'
  - '[x] 8665 Refactor HomeCanvas Styling & Pointer Events'
  - '[x] 8666 Optimize HomeCanvas Lifecycle (Pause/Resume)'
  - '[x] 8667 Optimize HomeCanvas Rendering (Gradient Caching)'
subIssuesCompleted: 6
subIssuesTotal: 6
blockedBy: []
blocking: []
---
# Epic: Home Hero Canvas (Neural Connectome)

## Objective
Implement a full-screen, offscreen canvas visualization for the Portal Home Hero section (`MainNeo`) to eliminate whitespace and showcase the "Application Engine" identity.

## Concept
**"The Neural Connectome"**: A multi-layered, parallax-enabled network visualization representing the connected state of the Neo.mjs runtime (Workers, Agents, Components). It serves as an ambient, intelligent backdrop for the landing page.

## Architecture
- **App Component:** `Portal.view.home.HomeCanvas` (new)
  - Handles resizing, DOM placement (z-index: -1), and worker messaging.
- **Shared Worker:** `Portal.canvas.HomeCanvas` (new)
  - Handles the physics simulation and rendering loop.
- **Pattern:** Reuse the **Zero-Allocation** strategy from `HeaderCanvas` (SharedWorker + OffscreenCanvas).

## Features
- **Deep Parallax:** 3-4 layers of network depth that shift subtly with mouse movement (2.5D).
- **Dynamic Topology:** Nodes and links that breathe, pulse, and rearrange.
- **Interaction:** Mouse repulsion/attraction or hover effects on nodes.
- **Theme:** "Luminous Flux" (matching the Header colors: `#3E63DD`, `#8BA6FF`).
- **Performance:** Target 60fps on high-refresh displays with zero GC pressure.

## Timeline

- 2026-01-15T01:05:08Z @tobiu assigned to @tobiu
- 2026-01-15T01:05:09Z @tobiu added the `enhancement` label
- 2026-01-15T01:05:09Z @tobiu added the `epic` label
- 2026-01-15T01:05:09Z @tobiu added the `ai` label
- 2026-01-15T01:05:56Z @tobiu added sub-issue #8662
- 2026-01-15T01:06:05Z @tobiu added sub-issue #8663
- 2026-01-15T01:06:18Z @tobiu added sub-issue #8664
- 2026-01-15T01:31:53Z @tobiu added sub-issue #8665
- 2026-01-15T01:42:50Z @tobiu added sub-issue #8666
- 2026-01-15T01:55:00Z @tobiu added sub-issue #8667

