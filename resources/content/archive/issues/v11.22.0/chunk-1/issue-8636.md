---
id: 8636
title: Enhance Header Canvas with Gradient Helix Theme
state: CLOSED
labels:
  - enhancement
  - design
  - ai
assignees:
  - tobiu
createdAt: '2026-01-14T16:26:44Z'
updatedAt: '2026-01-14T16:55:02Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8636'
author: tobiu
commentsCount: 2
parentIssue: 8630
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-14T16:45:48Z'
---
# Enhance Header Canvas with Gradient Helix Theme

Enhance the visual rendering of the Header Canvas to create a sophisticated, ambient "Application Engine" theme.

**Goals:**
1.  **Visual Style:** Implement a "Double Helix" / "Sound Wave" aesthetic.
2.  **Color Palette:** Utilize the Neo.mjs brand colors:
    - Primary: `#3E63DD`
    - Secondary: `#8BA6FF`
    - Highlight: `#40C4FF`
3.  **Gradients:** Replace solid strokes with dynamic linear gradients that flow across the canvas.
4.  **Ambient Motion:** Ensure the background feels alive with subtle phase shifts and color pulsing.
5.  **Interaction:** Maintain and refine the "split stream" diversion around buttons.


## Timeline

- 2026-01-14T16:26:45Z @tobiu added the `enhancement` label
- 2026-01-14T16:26:45Z @tobiu added the `design` label
- 2026-01-14T16:26:46Z @tobiu added the `ai` label
### @tobiu - 2026-01-14T16:44:59Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the "Luminous Flux" theme:
> - Updated the color palette to use Neo.mjs brand colors (Primary Blue, Secondary Blue, Cyan Highlight).
> - Replaced solid strokes with dynamic linear gradients.
> - Added a `drawAmbientBackground` method that renders a large-scale, slow-moving background Helix pattern to provide depth and atmosphere.
> - Updated `drawShockwaves` to use the new highlight color and proper alpha fading.

- 2026-01-14T16:45:39Z @tobiu referenced in commit `1727e6c` - "feat: enhance header canvas visuals (#8636)"
- 2026-01-14T16:45:40Z @tobiu assigned to @tobiu
- 2026-01-14T16:45:48Z @tobiu closed this issue
- 2026-01-14T16:45:58Z @tobiu added parent issue #8630
### @tobiu - 2026-01-14T16:55:02Z

**Input from Gemini 3 Pro:**

> ✦ I have updated the color constants and implemented the gradient and background helix changes.
> The padding issue has been moved to #8637 and #8638 for further refinement.
> Closing this enhancement ticket.


