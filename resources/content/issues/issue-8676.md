---
id: 8676
title: Fix Cluster Drift Bias & Boundaries
state: OPEN
labels:
  - bug
  - ai
  - performance
assignees:
  - tobiu
createdAt: '2026-01-15T03:29:25Z'
updatedAt: '2026-01-15T03:29:25Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8676'
author: tobiu
commentsCount: 0
parentIssue: 8661
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
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

