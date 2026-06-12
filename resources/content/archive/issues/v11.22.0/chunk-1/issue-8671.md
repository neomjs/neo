---
id: 8671
title: Implement Topology Mutation (Re-parenting)
state: CLOSED
labels:
  - enhancement
  - ai
  - performance
assignees:
  - tobiu
createdAt: '2026-01-15T02:39:26Z'
updatedAt: '2026-01-15T02:44:36Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8671'
author: tobiu
commentsCount: 1
parentIssue: 8661
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-15T02:44:36Z'
---
# Implement Topology Mutation (Re-parenting)

## Objective
Visualize **Atomic Moves** and **Object Permanence** by making the graph topology mutable at runtime.

## Tasks
1.  **Detach Logic:** Periodically (random chance), a `CHILD` node should set its `parentId` to `-2` (Drifting).
2.  **Drift Behavior:** Drifting nodes should move towards a different Cluster Center (Parent) than their original one.
3.  **Re-attach Logic:** When a drifting node gets close enough to a new Parent, it snaps to it (sets `parentId` to new ID) and joins the cluster cohesion physics.
4.  **Visuals:** Drifting nodes should perhaps pulse or change color to indicate their "transferring" state.

## Technical Details
-   Update `updatePhysics` loop to handle the "Drifting" state.
-   Ensure nodes don't just swap back and forth instantly (cooldown or distance threshold).

## Timeline

- 2026-01-15T02:39:26Z @tobiu assigned to @tobiu
- 2026-01-15T02:39:28Z @tobiu added the `enhancement` label
- 2026-01-15T02:39:28Z @tobiu added the `ai` label
- 2026-01-15T02:39:28Z @tobiu added the `performance` label
- 2026-01-15T02:39:43Z @tobiu added parent issue #8661
- 2026-01-15T02:43:00Z @tobiu referenced in commit `691a7e5` - "feat: Implement Topology Mutation (Re-parenting) for Neural Swarm (#8671)"
### @tobiu - 2026-01-15T02:44:09Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented Topology Mutation.
> 
> **Changes:**
> 1.  **Detach:** Child nodes now have a small random chance (0.05% per frame) to set their `parentId` to `-2` (Drifting).
> 2.  **Drift:** Drifting nodes ignore cohesion and wander randomly.
> 3.  **Re-attach:** Drifting nodes constantly scan for nearby Cluster Centers (Parents). If they come within 60px of a new Parent, they snap to it (`parentId = newParentId`).
> 4.  **Visuals:** Drifting nodes are highlighted (`HIGHLIGHT` color) and pulse to indicate their transient state.
> 
> The swarm is now mutable: nodes actively leave their clusters, drift through the ether, and join new groups.

- 2026-01-15T02:44:36Z @tobiu closed this issue

