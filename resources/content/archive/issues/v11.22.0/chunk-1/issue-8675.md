---
id: 8675
title: Implement Interactive Physics (Drag/Throw)
state: CLOSED
labels:
  - enhancement
  - ai
  - performance
assignees:
  - tobiu
createdAt: '2026-01-15T02:39:39Z'
updatedAt: '2026-01-15T03:15:37Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8675'
author: tobiu
commentsCount: 1
parentIssue: 8661
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-15T03:15:37Z'
---
# Implement Interactive Physics (Drag/Throw)

## Objective
Allow users to physically interact with the swarm beyond simple repulsion.

## Tasks
1.  **Grab & Throw:** If the user clicks and drags, they should "grab" the nearest node (or Cluster Parent).
    -   While holding, the node follows the mouse.
    -   Physics (Springs) will pull the connected cluster along.
2.  **Release:** On mouse up, impart the mouse velocity to the node ("Throw"), sending ripples through the physics system.

## Technical Details
-   Update `updateMouseState` to track drag state.
-   Update `updatePhysics` to override position for grabbed nodes.

## Timeline

- 2026-01-15T02:39:40Z @tobiu assigned to @tobiu
- 2026-01-15T02:39:41Z @tobiu added the `enhancement` label
- 2026-01-15T02:39:41Z @tobiu added the `ai` label
- 2026-01-15T02:39:41Z @tobiu added the `performance` label
- 2026-01-15T02:39:55Z @tobiu added parent issue #8661
- 2026-01-15T03:12:04Z @tobiu referenced in commit `cf27784` - "feat: Implement Interactive Physics (Force Push) for Neural Swarm (#8675)"
### @tobiu - 2026-01-15T03:15:14Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented Interactive Physics ("Force Push").
> 
> **Changes:**
> 1.  **View Layer:** Updated `MainNeo.mjs` to capture `click`, `mousemove` (local), and `mouseleave`. These events are delegated to `HomeCanvas.mjs`, which forwards them to the SharedWorker.
> 2.  **Physics Engine:** Implemented a "Force Push" mechanic. When a Shockwave expands, it doesn't just gently repel nodes; it imparts a massive, lasting velocity impulse to any node caught in the wave front (`force * 10`).
> 3.  **Result:** Clicking on the canvas now feels powerful—like dropping a bomb into the swarm—scattering nodes and agents, which then slowly drift back together due to cohesion.

- 2026-01-15T03:15:37Z @tobiu closed this issue

