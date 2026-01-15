---
id: 8672
title: Implement Cluster Drift (Flow Fields)
state: CLOSED
labels:
  - enhancement
  - ai
  - performance
assignees:
  - tobiu
createdAt: '2026-01-15T02:39:29Z'
updatedAt: '2026-01-15T02:49:27Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8672'
author: tobiu
commentsCount: 1
parentIssue: 8661
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-15T02:49:27Z'
---
# Implement Cluster Drift (Flow Fields)

## Objective
Replace simple linear velocity/bounce for Parent nodes with organic **Flow Field** movement.

## Tasks
1.  **Flow Field:** Implement 2D Simplex Noise or Perlin Noise (or a simple sine-sum field) to generate a velocity vector field across the canvas.
2.  **Parent Movement:** `PARENT` nodes (Cluster Centers) should sample this field to determine their velocity (`vx`, `vy`). This will make them drift in "currents".
3.  **Child Propagation:** Since Children seek Parents, they will naturally form "tails" or swarms following these currents.

## Technical Details
-   Can use a lightweight pseudo-noise function (no heavy library needed).
-   Update `updatePhysics` to apply flow vectors to Parents.

## Timeline

- 2026-01-15T02:39:29Z @tobiu assigned to @tobiu
- 2026-01-15T02:39:31Z @tobiu added the `enhancement` label
- 2026-01-15T02:39:31Z @tobiu added the `ai` label
- 2026-01-15T02:39:31Z @tobiu added the `performance` label
- 2026-01-15T02:39:49Z @tobiu added parent issue #8661
- 2026-01-15T02:47:19Z @tobiu referenced in commit `a809e84` - "feat: Implement Cluster Drift (Flow Fields) for Neural Swarm (#8672)"
### @tobiu - 2026-01-15T02:48:14Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the Cluster Drift using Flow Fields.
> 
> **Changes:**
> 1.  **Flow Field:** Replaced the random drift for `PARENT` nodes with a calculated Vector Field.
> 2.  **Algorithm:** Uses a combined Sine/Cosine function based on spatial position (`x`, `y`) and `time` to generate organic, swirling currents.
> 3.  **Dynamics:** Parent nodes now "swim" along these currents. Since Child nodes are physically attracted to Parents (Cohesion), the entire cluster moves as a fluid swarm rather than a static group.
> 
> The result is a more biological, "living system" movement pattern.

- 2026-01-15T02:49:27Z @tobiu closed this issue

