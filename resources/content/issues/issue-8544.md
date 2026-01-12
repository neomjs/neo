---
id: 8544
title: 'Enhancement: Physics-based "Traffic" Animation (Variable Speed & Length)'
state: CLOSED
labels:
  - enhancement
  - design
  - ai
assignees:
  - tobiu
createdAt: '2026-01-11T13:46:17Z'
updatedAt: '2026-01-11T14:30:15Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8544'
author: tobiu
commentsCount: 1
parentIssue: 8398
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-11T13:55:20Z'
---
# Enhancement: Physics-based "Traffic" Animation (Variable Speed & Length)

- **Goal:** Enhance the animation with physics-based "Traffic" dynamics to make it feel more organic and responsive.
- **Concept:** The pulse should behave like a vehicle navigating the network:
    -   **Fast on Highways:** High velocity on the vertical segments between nodes.
    -   **Slow in Towns:** Decelerate when approaching a node to navigate the "orbit".
    -   **Accelerate out:** Speed up as it leaves the node.
- **Visual Enhancement (Squash & Stretch):**
    -   The pulse length should be dynamic.
    -   **Long/Streaked** when moving fast (motion blur effect).
    -   **Short/Condensed** when moving slow (concentrated energy).
- **Technical Implementation:**
    -   Refactor `TicketCanvas.mjs` from time-based (`t * speed`) to stateful integration (`pos += velocity * dt`).
    -   Implement a proximity-based velocity function: `v = f(distance_to_nearest_node)`.
    -   Increase base speed significantly to compensate for the slowdowns.

## Timeline

- 2026-01-11T13:46:18Z @tobiu added the `enhancement` label
- 2026-01-11T13:46:19Z @tobiu added the `design` label
- 2026-01-11T13:46:19Z @tobiu added the `ai` label
- 2026-01-11T13:54:39Z @tobiu referenced in commit `63767fe` - "feat: Implement physics-based 'Traffic' animation with squash & stretch (#8544)"
### @tobiu - 2026-01-11T13:55:00Z

**Input from Gemini 3 Pro:**

> ✦ Implemented a physics-based animation system (The "Traffic" Model):
> 
> 1.  **Stateful Physics Loop:** Replaced the time-based loop with `pulseY += velocity * dt`. This allows for variable speeds.
> 2.  **Traffic Logic:**
>     -   **Base Speed:** Increased from 0.15 to **0.5 px/ms** (3x faster).
>     -   **Highway:** When far from nodes (>150px), the pulse accelerates up to **1.5x** base speed (0.75 px/ms).
>     -   **Town:** When approaching a node (0px), it decelerates to **0.2x** base speed (0.1 px/ms), creating a deliberate "slow down to orbit" effect.
>     -   **Ease-Out Curve:** Used a quadratic ease-out for smooth braking.
> 3.  **Squash & Stretch:**
>     -   The `pulseLength` is no longer static (100px).
>     -   It stretches up to **120px** when moving fast (motion blur).
>     -   It compresses down to **~16px** when moving slow (concentrated energy).
> 
> This creates a highly organic feel where the data "zooms" between nodes and "carefully negotiates" the connections.

- 2026-01-11T13:55:20Z @tobiu closed this issue
- 2026-01-11T14:30:15Z @tobiu assigned to @tobiu
- 2026-01-11T14:30:27Z @tobiu added parent issue #8398

