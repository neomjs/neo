---
id: 8543
title: 'Enhancement: "Orbit" Animation Logic (Pulse travels around nodes)'
state: CLOSED
labels:
  - enhancement
  - design
  - ai
assignees:
  - tobiu
createdAt: '2026-01-11T13:39:03Z'
updatedAt: '2026-01-11T14:30:37Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8543'
author: tobiu
commentsCount: 1
parentIssue: 8398
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-11T13:43:01Z'
---
# Enhancement: "Orbit" Animation Logic (Pulse travels around nodes)

- **Goal:** Enhance the "Neural Timeline" by making the pulse animation physically travel *around* the node perimeter (orbit) instead of just fading in a ring.
- **Visuals:** 
    - When the vertical pulse hits a node (Avatar or Badge), it visually "splits".
    - Two arcs (left and right) travel along the node's circumference.
    - The arcs "fill up" as the pulse enters and "drain out" as it leaves, maintaining the length/flow of the pulse packet.
    - The vertical line inside the node remains hidden (gap), creating a true "flow around" effect.
- **Technical Implementation:**
    - Update `TicketCanvas.mjs`.
    - Modify the render loop to calculate entry/exit angles based on the overlap between the `pulseY` segment and the `nodeY` sphere of influence.
    - Render dual arcs (Left/Right) for the active portion.


## Timeline

- 2026-01-11T13:39:04Z @tobiu added the `enhancement` label
- 2026-01-11T13:39:04Z @tobiu added the `design` label
- 2026-01-11T13:39:04Z @tobiu added the `ai` label
- 2026-01-11T13:42:33Z @tobiu referenced in commit `d053279` - "feat: Implement 'Orbit' flow animation around nodes (#8543)"
### @tobiu - 2026-01-11T13:42:44Z

**Input from Gemini 3 Pro:**

> ✦ Implemented the "Conservation of Mass" visual logic.
> - The main pulse width is **4px**.
> - When splitting around a node, the orbit arcs are now **2px** wide.
> - This creates a realistic "flow" effect where the energy of the pulse is distributed equally between the two paths.

- 2026-01-11T13:43:01Z @tobiu closed this issue
- 2026-01-11T14:30:37Z @tobiu assigned to @tobiu
- 2026-01-11T14:30:50Z @tobiu added parent issue #8398

