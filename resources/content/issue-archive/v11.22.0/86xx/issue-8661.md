---
id: 8661
title: 'Epic: Home Hero Canvas (The Neural Swarm)'
state: CLOSED
labels:
  - enhancement
  - epic
  - ai
assignees:
  - tobiu
createdAt: '2026-01-15T01:05:08Z'
updatedAt: '2026-01-15T11:37:59Z'
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
  - '[x] 8668 Implement Cluster Physics & Mutable Topology'
  - '[x] 8669 Implement Autonomous Agent Drones (Boids)'
  - '[x] 8670 Implement Data Flow & Interaction Visuals'
  - '[x] 8671 Implement Topology Mutation (Re-parenting)'
  - '[x] 8672 Implement Cluster Drift (Flow Fields)'
  - '[x] 8673 Implement Elastic Connections & Breathing'
  - '[x] 8674 Implement Agent-Driven State'
  - '[x] 8675 Implement Interactive Physics (Drag/Throw)'
  - '[x] 8676 Fix Cluster Drift Bias & Boundaries'
  - '[x] 8677 Enhance Shockwave Visuals'
  - '[x] 8678 Implement Hero Container Wrapper'
  - '[x] 8679 Enhance Neural Swarm Documentation'
  - '[x] 8680 Write Guide: The Neural Swarm'
  - '[x] 8681 Restore Shockwave Physics Interaction'
  - '[x] 8682 Optimize Neural Swarm Contrast for Light Theme'
  - '[x] 8683 Home Hero Canvas: Visual Polish (Blue Shockwave) & GC Optimization'
subIssuesCompleted: 22
subIssuesTotal: 22
blockedBy: []
blocking: []
closedAt: '2026-01-15T11:37:59Z'
---
# Epic: Home Hero Canvas (The Neural Swarm)

## Objective
Implement a living, "Agent-Native" simulation for the Portal Home Hero section. Instead of a passive network background, this canvas will visualize the **Neo.mjs Application Engine** as a mutable, multi-threaded runtime inhabited by AI agents.

## Concept: "The Neural Swarm"
A simulated ecosystem representing the "Living Graph" of a Neo.mjs application.
*   **The Nodes:** Represent persistent runtime objects (Components).
*   **The Agents:** Represent the "Ghost in the Shell" (Neural Link).
*   **The Topology:** Mutable, fluid, and reconfigurable (Atomic Moves).

## Features

### 1. Living Topology (Object Permanence)
*   **Cluster Physics:** Nodes are not random; they form hierarchical clusters (Components inside Containers).
*   **Mutation:** Occasionally, a sub-cluster will detach from its parent, drift, and re-attach to a new cluster, visualizing **Atomic Moves** (Release v11.21.0).
*   **Initialization:** Use **Poisson Disk Sampling** or **Golden Spiral** distribution to ensure instant, uniform screen coverage (fixing the "expanding blob" issue).

### 2. Autonomous Agents (The Neural Link)
*   **Seeker Drones:** Fast-moving energy points that behave like autonomous agents (Boids behavior).
*   **Inspection:** Agents fly between clusters, "scanning" nodes (triggering a highlight effect) and "repairing" links.
*   **Trails:** Agents leave fading data trails, visualizing the high-frequency communication of the SharedWorker architecture.

### 3. Data Flow & Pulse
*   **Signal Packets:** Pulses of light travel along the connections between nodes, visualizing the data flow between Workers.
*   **Deep Parallax:** 3-4 layers of depth to create a volumetric feel.

## Architecture
- **App Component:** `Portal.view.home.HomeCanvas`
  - Resizing, DOM placement, lifecycle management.
- **Shared Worker:** `Portal.canvas.HomeCanvas`
  - **Physics Engine:** Custom Verlet integration for stability.
  - **Boid System:** Separation, Alignment, Cohesion for Agents.
  - **Render Loop:** Zero-Allocation implementation using `Float32Array` buffers for all entities.

## Visual Theme
- **Palette:** "Luminous Flux" (`#3E63DD`, `#8BA6FF`) with bright white/cyan highlights (`#40C4FF`) for Agents and Data Packets.
- **Atmosphere:** Deep, premium, desktop-class aesthetic.

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
- 2026-01-15T02:10:12Z @tobiu changed title from **Epic: Home Hero Canvas (Neural Connectome)** to **Epic: Home Hero Canvas (The Neural Swarm)**
- 2026-01-15T02:12:51Z @tobiu added sub-issue #8668
- 2026-01-15T02:13:16Z @tobiu added sub-issue #8669
- 2026-01-15T02:13:39Z @tobiu added sub-issue #8670
- 2026-01-15T02:39:43Z @tobiu added sub-issue #8671
- 2026-01-15T02:39:49Z @tobiu added sub-issue #8672
- 2026-01-15T02:39:51Z @tobiu added sub-issue #8673
- 2026-01-15T02:39:53Z @tobiu added sub-issue #8674
- 2026-01-15T02:39:55Z @tobiu added sub-issue #8675
- 2026-01-15T03:29:40Z @tobiu added sub-issue #8676
- 2026-01-15T03:29:43Z @tobiu added sub-issue #8677
- 2026-01-15T03:29:46Z @tobiu added sub-issue #8678
- 2026-01-15T03:29:48Z @tobiu added sub-issue #8679
- 2026-01-15T03:29:52Z @tobiu added sub-issue #8680
- 2026-01-15T08:59:54Z @tobiu added sub-issue #8681
- 2026-01-15T09:13:49Z @tobiu added sub-issue #8682
- 2026-01-15T10:56:56Z @tobiu added sub-issue #8683
- 2026-01-15T11:37:59Z @tobiu closed this issue

