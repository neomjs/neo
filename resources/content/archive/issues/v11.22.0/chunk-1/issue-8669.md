---
id: 8669
title: Implement Autonomous Agent Drones (Boids)
state: CLOSED
labels:
  - enhancement
  - ai
  - performance
assignees:
  - tobiu
createdAt: '2026-01-15T02:13:07Z'
updatedAt: '2026-01-15T02:28:20Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8669'
author: tobiu
commentsCount: 1
parentIssue: 8661
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-15T02:28:20Z'
---
# Implement Autonomous Agent Drones (Boids)

## Objective
Implement autonomous "Seeker Drones" that inhabit the Home Canvas, visualizing the **Neural Link**.

## Tasks
1.  **Boid System:** Implement a lightweight Boids algorithm (Separation, Alignment, Cohesion) in `Portal.canvas.HomeCanvas`.
2.  **Agent Entity:**
    -   Visual: Bright, fast-moving particles (`#40C4FF`) with a "Data Trail" (fading tail).
    -   Behavior: They should patrol between Cluster Centers.
3.  **Inspection Logic:** When an Agent reaches a Node, trigger a "Scan" effect (node highlights briefly).

## Technical Details
-   Add `agentBuffer` (Float32Array) to `HomeCanvas`.
-   Use `requestAnimationFrame` (via setTimeout) in SharedWorker.

## Timeline

- 2026-01-15T02:13:07Z @tobiu assigned to @tobiu
- 2026-01-15T02:13:08Z @tobiu added the `enhancement` label
- 2026-01-15T02:13:08Z @tobiu added the `ai` label
- 2026-01-15T02:13:08Z @tobiu added the `performance` label
- 2026-01-15T02:13:16Z @tobiu added parent issue #8661
- 2026-01-15T02:27:05Z @tobiu referenced in commit `2ec5ff7` - "feat: Implement Autonomous Agent Drones (Boids) for Neural Swarm (#8669)"
### @tobiu - 2026-01-15T02:27:22Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the Autonomous Agent Drones (Boids).
> 
> **Changes:**
> 1.  **Agent System:** Added `agentBuffer` (Float32Array) to store 20 agents with state (x, y, vx, vy, target, state).
> 2.  **Autonomous Behavior:** Implemented `updateAgents` with a State Machine:
>     -   **Seek:** Agents pick a random Cluster Center (Parent Node) and fly towards it.
>     -   **Scan:** Upon arrival, they enter a "Scanning" state (hovering) before picking a new target.
>     -   **Flee:** Agents actively repel from the mouse cursor (simulating "observer effect").
> 3.  **Visuals:**
>     -   **Drones:** Rendered as bright particles (`#FFFFFF` core).
>     -   **Trails:** Implemented a motion-blur trail effect opposite to the velocity vector.
>     -   **Scan Ring:** A pulsing ring appears when an agent is "scanning" a node.
> 
> The swarm now has "purpose" – agents patrol the network, inspecting nodes, and reacting to user presence.

- 2026-01-15T02:28:20Z @tobiu closed this issue

