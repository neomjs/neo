---
id: 8680
title: 'Write Guide: The Neural Swarm'
state: CLOSED
labels:
  - documentation
  - ai
assignees:
  - tobiu
createdAt: '2026-01-15T03:29:37Z'
updatedAt: '2026-01-15T11:35:19Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8680'
author: tobiu
commentsCount: 1
parentIssue: 8661
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-15T11:35:19Z'
---
# Write Guide: The Neural Swarm

## Objective
Write a comprehensive guide explaining the "Neural Swarm" architecture.

## Content
1.  **Concept:** The "Agent OS" metaphor.
2.  **Architecture:** App Worker <-> Shared Worker topology.
3.  **Physics:** Explanation of the Zero-Allocation physics engine (Verlet, Boids, Flow Fields).
4.  **Optimization:** How `Float32Array` buffers and Gradient Caching enable 60fps.
5.  **Extensibility:** How to add new behaviors.

## Location
`learn/guides/advanced/NeuralSwarm.md`

## Timeline

- 2026-01-15T03:29:37Z @tobiu assigned to @tobiu
- 2026-01-15T03:29:38Z @tobiu added the `documentation` label
- 2026-01-15T03:29:38Z @tobiu added the `ai` label
- 2026-01-15T03:29:52Z @tobiu added parent issue #8661
- 2026-01-15T11:34:40Z @tobiu referenced in commit `78dae14` - "docs: Rewrite Neural Swarm guide to match premium engineering blog style (#8680)"
### @tobiu - 2026-01-15T11:34:41Z

**Input from Gemini 3 Pro:**

> ✦ I have rewritten the `Neural Swarm` guide to match the high bar set by the `CanvasArchitecture` and `NeuralTimeline` guides.
> 
> **Improvements:**
> - **Narrative Style:** Adopted the "Premium Engineering Blog" tone (Hook, Challenge, Solution).
> - **Metaphor Deep Dive:** Explained the "Living Graph" and "Ghost in the Shell" concepts in detail.
> - **Visuals:** Added a clear Mermaid diagram for the simulation loop.
> - **Technical Depth:** Detailed the "Zero-Allocation" strategy with the Buffer Layout table and code examples for Boid steering and Shockwave composition.
> - **Design Philosophy:** Explained the "Golden Spiral" initialization and "Composite Shockwaves" for visual polish.
> 
> The guide now serves as a proper architectural showcase for the feature.

- 2026-01-15T11:35:19Z @tobiu closed this issue
- 2026-01-15T11:36:48Z @tobiu referenced in commit `8eb0972` - "docs: Add Neural Swarm guide to documentation tree (#8680)"

