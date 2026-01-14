---
id: 8556
title: 'Enhance Neural Timeline: Limit spine and pulse to last item'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-11T17:44:15Z'
updatedAt: '2026-01-11T17:47:47Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8556'
author: tobiu
commentsCount: 1
parentIssue: 8398
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-11T17:47:47Z'
---
# Enhance Neural Timeline: Limit spine and pulse to last item

The timeline spine currently extends to the bottom of the canvas view. It should stop at the center of the last timeline item to create a visually contained "Group".

The "Pulse" animation must also be updated to respect this new boundary, resetting once it passes the last node instead of traveling into empty space.

## Timeline

- 2026-01-11T17:44:17Z @tobiu added the `enhancement` label
- 2026-01-11T17:44:17Z @tobiu added the `ai` label
- 2026-01-11T17:44:26Z @tobiu added parent issue #8398
- 2026-01-11T17:47:22Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-11T17:47:30Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the requested changes in `apps/portal/canvas/TicketCanvas.mjs`.
> 
> **Changes:**
> 1.  **Spine Geometry:** The connection line now stops at the center of the last timeline node (`maxY`), instead of extending to the bottom of the canvas.
> 2.  **Pulse Physics:** The pulse animation loop now resets when the pulse travels past `maxY` (plus a buffer), ensuring it doesn't float into empty space.
> 3.  **Pulse Rendering:** The pulse drawing is clamped to `maxY` to simulate it "disappearing" into the last node.
> 
> The "Zombie Canvas Loop" fix from the previous session (clearing context on unmount) remains intact.

- 2026-01-11T17:47:47Z @tobiu closed this issue

