---
id: 8673
title: Implement Elastic Connections & Breathing
state: CLOSED
labels:
  - enhancement
  - ai
  - performance
assignees:
  - tobiu
createdAt: '2026-01-15T02:39:34Z'
updatedAt: '2026-01-15T02:55:49Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8673'
author: tobiu
commentsCount: 1
parentIssue: 8661
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-15T02:55:49Z'
---
# Implement Elastic Connections & Breathing

## Objective
Make the connections feel physical and alive, not just static lines.

## Tasks
1.  **Elasticity:** Visualize tension. If a node is far from its parent, the line should be thin/taut. If close, thicker/loose.
2.  **Pulse on Packet:** When a Data Packet travels a link, the link itself should vibrate or "bulge" slightly at the packet's location.
3.  **Node Breathing:** Nodes should slowly oscillate in size (sine wave based on unique offset) to feel "alive".

## Technical Details
-   Update `drawNetwork` to modulate `lineWidth` and `globalAlpha` based on physics state.
-   Update `nodeBuffer` to store a `phase` offset for breathing.

## Timeline

- 2026-01-15T02:39:34Z @tobiu assigned to @tobiu
- 2026-01-15T02:39:35Z @tobiu added the `enhancement` label
- 2026-01-15T02:39:35Z @tobiu added the `ai` label
- 2026-01-15T02:39:35Z @tobiu added the `performance` label
- 2026-01-15T02:39:51Z @tobiu added parent issue #8661
- 2026-01-15T02:55:04Z @tobiu referenced in commit `13f89b2` - "feat: Implement Elastic Connections & Breathing for Neural Swarm (#8673)"
### @tobiu - 2026-01-15T02:55:27Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented Elastic Connections & Breathing.
> 
> **Changes:**
> 1.  **Breathing:** Each node now has a unique `phase` (0..2PI). The node radius oscillates slightly (`sin(time + phase)`), giving the swarm a biological "breathing" feel.
> 2.  **Elasticity:** Connection `lineWidth` is now modulated by distance. Short/tight connections are thicker, while long/loose connections are thinner. This visualizes tension.
> 3.  **Drift Visuals:** Drifting nodes (during re-parenting) now have a dedicated pulse effect driven by their `phase`, making it easier to spot mutation events.
> 
> The visual system now feels much less static and more "alive".

- 2026-01-15T02:55:49Z @tobiu closed this issue

