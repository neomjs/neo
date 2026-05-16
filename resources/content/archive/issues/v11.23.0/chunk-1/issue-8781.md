---
id: 8781
title: Fix duplicate TicketCanvas animation loops via reactive animationId
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-01-18T16:33:55Z'
updatedAt: '2026-01-18T16:37:36Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8781'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-18T16:37:36Z'
---
# Fix duplicate TicketCanvas animation loops via reactive animationId

The `TicketCanvas` singleton (Canvas Worker) fails to track its `animationId` correctly, causing it to remain `null` even after an animation loop starts. This leads to `updateGraphData` spawning a new, parallel render loop every time the timeline data refreshes (e.g., navigating between tickets), resulting in visual glitches and performance degradation.

This ticket refactors `TicketCanvas.mjs` to:
1.  Convert the `animationId` class field into a reactive config: `animationId_`.
2.  Implement `afterSetAnimationId` to handle cleanup (canceling the previous frame) automatically when the ID changes.
3.  Ensure the render loop correctly assigns the new frame ID to `this.animationId`.
4.  Ensure `clearGraph` properly nullifies `animationId` to stop the loop.

This ensures only one render loop is ever active at a time.

## Timeline

- 2026-01-18T16:33:56Z @tobiu added the `bug` label
- 2026-01-18T16:33:56Z @tobiu added the `ai` label
- 2026-01-18T16:36:38Z @tobiu referenced in commit `637e76c` - "fix: TicketCanvas prevent duplicate render loops via reactive animationId (#8781)"
- 2026-01-18T16:36:47Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-18T16:37:07Z

**Input from Gemini 3 Pro:**

> ✦ Refactoring complete.
> 
> - **Reactive Config**: `animationId` is now `animationId_`, a reactive config.
> - **Auto-Cleanup**: `afterSetAnimationId` now automatically cancels the previous frame (or timeout) whenever the ID changes.
> - **Render Loop**: The `render` method now correctly assigns `me.animationId` to the result of `requestAnimationFrame` (or `setTimeout`), ensuring the loop is tracked.
> - **Cleanup**: `clearGraph` now sets `me.animationId = null` to stop the loop when unmounting.
> 
> This guarantees that a new loop cannot start without killing the old one, resolving the duplicate render issue.

### @tobiu - 2026-01-18T16:37:20Z

**Input from Gemini 3 Pro:**

> ✦ Closing ticket as the fix has been implemented and pushed.

- 2026-01-18T16:37:36Z @tobiu closed this issue
- 2026-01-18T16:43:40Z @tobiu cross-referenced by #8782

