---
id: 8542
title: 'Enhancement: "Orbit" Effect & Visual Polish for Neural Timeline'
state: CLOSED
labels:
  - enhancement
  - design
  - ai
  - performance
assignees:
  - tobiu
createdAt: '2026-01-11T13:14:12Z'
updatedAt: '2026-01-11T13:36:19Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8542'
author: tobiu
commentsCount: 1
parentIssue: 8398
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-11T13:36:19Z'
---
# Enhancement: "Orbit" Effect & Visual Polish for Neural Timeline

### Context
The new Canvas-based timeline implementation draws the neural connection line on top of the avatars and badges. This contrasts with the previous CSS version where the line was visually "behind" or clearly separated, resulting in an unpolished look.

### Goals
1.  **Orbit Effect:** Instead of drawing the line *through* the nodes, the line should interact with them. It should either:
    -   Stop before the node and resume after (create a gap).
    -   "Orbit" around the node (draw arcs).
2.  **Color Refinement:** Challenge the "dormant" line color.
    -   Currently: Light Blue.
    -   Proposal: Consider reverting to Light Gray (matching the old CSS border) for the static line, keeping the Light Blue only for the active "Pulse". This would increase contrast and make the pulse feel more special.

### Implementation
-   Update `TicketCanvas.mjs` render loop.
-   Use the existing `node.radius` (derived from `rect.width`) to calculate entry/exit points for the line segments.

## Timeline

- 2026-01-11T13:14:13Z @tobiu added the `enhancement` label
- 2026-01-11T13:14:13Z @tobiu added the `design` label
- 2026-01-11T13:14:13Z @tobiu added the `ai` label
- 2026-01-11T13:14:13Z @tobiu added the `performance` label
- 2026-01-11T13:25:23Z @tobiu assigned to @tobiu
- 2026-01-11T13:25:31Z @tobiu added parent issue #8398
- 2026-01-11T13:35:44Z @tobiu referenced in commit `2da4760` - "feat: Implement 'Orbit' effect and refine timeline visuals (#8542)"
### @tobiu - 2026-01-11T13:36:02Z

**Input from Gemini 3 Pro:**

> ✦ Implemented the 'Orbit' effect and visual polish.
> -   **Static Spine:** Changed to a subtle gray (`rgba(150, 150, 150, 0.2)`) to reduce visual noise.
> -   **Orbit Gap:** Implemented a dynamic 'cut-out' effect using `globalCompositeOperation = 'destination-out'`. The line now stops cleanly before the node and resumes after, respecting the node's size.
> -   **Dynamic Padding:** Avatars (larger) receive 6px padding, while Badges (smaller) receive 3px, accentuating the hierarchy.
> -   **Active Orbit:** When the pulse passes a node, it draws a glowing ring around it.

- 2026-01-11T13:36:19Z @tobiu closed this issue

