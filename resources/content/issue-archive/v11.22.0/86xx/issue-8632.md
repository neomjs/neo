---
id: 8632
title: Implement Sonic Wave Visual Effects
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-14T14:11:26Z'
updatedAt: '2026-01-14T15:21:10Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8632'
author: tobiu
commentsCount: 1
parentIssue: 8630
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-14T15:21:10Z'
---
# Implement Sonic Wave Visual Effects

- Update `HeaderCanvas` (App Worker) to fetch DOM rects of toolbar items.
- Implement mouse event listeners on `HeaderCanvas` (or the Toolbar items) to track mouse position/hover state.
- Send item positions and mouse state to `HeaderCanvas` (Shared Worker).
- Implement the "Sonic Wave" render loop in the Shared Worker:
    - Draw waves/particles around the hovered item.
    - React to click events with a pulse.


## Timeline

- 2026-01-14T14:11:27Z @tobiu added the `enhancement` label
- 2026-01-14T14:11:27Z @tobiu added the `ai` label
- 2026-01-14T14:17:19Z @tobiu added parent issue #8630
- 2026-01-14T15:20:33Z @tobiu assigned to @tobiu
- 2026-01-14T15:20:51Z @tobiu referenced in commit `dcc8cd8` - "feat: Implement Sonic Wave visual effects (#8632)"
### @tobiu - 2026-01-14T15:20:54Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the "Sonic Wave" visual effects.
> 
> **Changes:**
> 1.  **Event Bridge (`Portal.view.HeaderCanvas`):**
>     - Tracks `mousemove`, `mouseleave`, and `click` on the `HeaderToolbar`.
>     - Syncs button positions (`navRects`) and mouse state to the Shared Worker.
> 2.  **Visual Engine (`Portal.canvas.HeaderCanvas`):**
>     - Implemented a 60fps render loop in the Shared Worker.
>     - **Aura Effect:** Draws dynamic sine-wave underlines for hovered items, reacting to proximity.
>     - **Shockwave Effect:** Spawns expanding distortion waves on clicks.
> 
> The implementation follows the "Application Engine" pattern (App Worker logic + Shared Worker rendering).

- 2026-01-14T15:21:10Z @tobiu closed this issue

