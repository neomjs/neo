---
id: 8676
title: Fix Cluster Drift Bias & Boundaries
state: CLOSED
labels:
  - bug
  - ai
  - performance
assignees:
  - tobiu
createdAt: '2026-01-15T03:29:25Z'
updatedAt: '2026-01-15T08:37:56Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8676'
author: tobiu
commentsCount: 1
parentIssue: 8661
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-15T08:37:56Z'
---
# Fix Cluster Drift Bias & Boundaries

## Objective
Fix the "Top-Left Drift" bias and constrain the Swarm to the viewport center.

## Issues
1.  **Drift Bias:** The Flow Field or Ambient Drift calculations likely accumulate rounding errors or have a directional bias (negative coordinates?), causing the swarm to migrate off-screen over time.
2.  **Unreachable Nodes:** Once nodes drift into corners, the "Force Push" (Shockwave) cannot bring them back because the user can't click outside the viewport.

## Tasks
1.  **Debug Flow Field:** Visualize or audit the vector field to ensure it is centered (0,0 is center of rotation).
2.  **Implement "Containment Field":** Add a physics force that gently pushes all nodes towards the center if they exceed a certain radius (e.g., 70% of screen width).
    -   Force should be exponential: weak near center, strong near edges.
3.  **Dynamic Padding:** Calculate bounds based on screen size to ensure the swarm looks good on mobile vs desktop.

## Timeline

- 2026-01-15T03:29:26Z @tobiu assigned to @tobiu
- 2026-01-15T03:29:27Z @tobiu added the `bug` label
- 2026-01-15T03:29:27Z @tobiu added the `ai` label
- 2026-01-15T03:29:28Z @tobiu added the `performance` label
- 2026-01-15T03:29:40Z @tobiu added parent issue #8661
- 2026-01-15T08:37:16Z @tobiu referenced in commit `1f77ea2` - "fix: Implement containment field to correct Neural Swarm drift (#8676)"
### @tobiu - 2026-01-15T08:37:23Z

**Input from Gemini 3 Pro:**

> ✦ Implemented a "Containment Field" in `updatePhysics`.
> - **Logic:** Calculates distance from center (cx, cy). If `dist > min(w,h) * 0.4`, applies a soft restoring force `(dist - limit) * 0.001` towards the center.
> - **Target:** Applied to Parent nodes (Children follow parents via existing cohesion).
> - **Outcome:** Fixes the "Top-Left Drift" and prevents nodes from getting stuck in corners while maintaining organic flow.

- 2026-01-15T08:37:56Z @tobiu closed this issue

