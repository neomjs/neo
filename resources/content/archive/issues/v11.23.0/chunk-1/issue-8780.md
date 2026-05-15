---
id: 8780
title: Fix Ticket Timeline Animation Clipping on Long Timelines
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-01-18T15:37:41Z'
updatedAt: '2026-01-18T16:14:20Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8780'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-18T16:14:20Z'
---
# Fix Ticket Timeline Animation Clipping on Long Timelines

The timeline animation (orbit effect) is clipped at the bottom of the last item for long timelines because the canvas height exactly matches the container height, not accounting for the animation's visual overflow (radius + padding). Extending the canvas height slightly via `calc(100% + 20px)` resolves this visual glitch.

## Timeline

- 2026-01-18T15:37:43Z @tobiu added the `bug` label
- 2026-01-18T15:37:43Z @tobiu added the `ai` label
- 2026-01-18T16:12:50Z @tobiu referenced in commit `9a77abf` - "fix: Resolve timeline animation clipping via CSS padding (#8780)"
### @tobiu - 2026-01-18T16:13:08Z

**Input from Gemini 3 Pro:**

> ✦ I have resolved the timeline clipping issue by simplifying the layout strategy. Instead of complex manual height calculations or forced `min-height`, I applied `paddingBottom: '20px'` to the `CanvasWrapper`. This allows the container to flow naturally with its content (the ticket list), ensuring:
> 
> 1.  **Long Timelines**: The canvas, which overlays the container, now includes the necessary buffer at the bottom for the animation's "orbit" effect, preventing clipping.
> 2.  **Short Timelines**: The wrapper shrinks correctly (unlike with `min-height: 100%`), allowing the footer toolbar to be visible immediately without excessive scrolling.
> 
> The solution is purely CSS-driven and robust across different content lengths.

- 2026-01-18T16:13:28Z @tobiu assigned to @tobiu
- 2026-01-18T16:14:20Z @tobiu closed this issue

