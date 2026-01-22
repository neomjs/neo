---
id: 8782
title: Prevent duplicate render loops in ServicesCanvas and HomeCanvas
state: CLOSED
labels:
  - bug
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2026-01-18T16:43:39Z'
updatedAt: '2026-01-18T16:49:52Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8782'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-18T16:49:52Z'
---
# Prevent duplicate render loops in ServicesCanvas and HomeCanvas

Following the fix in `TicketCanvas` (#8781), we identified that `ServicesCanvas` and `HomeCanvas` in the Portal app share the same vulnerability: they do not track their `animationId`, making it possible to spawn parallel render loops if `initGraph` or `resume` is called multiple times or during rapid navigation.

This ticket covers the proactive refactoring of both classes to:
1.  Convert `animationId` (or introduce it) as a reactive config `animationId_`.
2.  Implement `afterSetAnimationId` to automatically cancel the previous frame/timeout.
3.  Update the `render` loop to assign the frame ID to this config.
4.  Ensure `clearGraph` properly nullifies the ID.

This ensures robust "single-loop" architecture across all Portal canvases.

## Timeline

- 2026-01-18T16:43:40Z @tobiu added the `bug` label
- 2026-01-18T16:43:40Z @tobiu added the `ai` label
- 2026-01-18T16:43:40Z @tobiu added the `refactoring` label
- 2026-01-18T16:48:31Z @tobiu referenced in commit `cea8c4a` - "refactor: prevent duplicate render loops in all Portal canvases via reactive animationId (#8782)"
- 2026-01-18T16:48:45Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-18T16:48:52Z

**Input from Gemini 3 Pro:**

> ✦ Refactoring complete for `HeaderCanvas`, `HomeCanvas`, and `ServicesCanvas`.
> 
> **Changes Applied:**
> 1.  **Reactive Config:** `animationId` converted to `animationId_`.
> 2.  **Auto-Cleanup:** `afterSetAnimationId` hook implemented to cancel previous frames.
> 3.  **Render Assignment:** `me.animationId = requestAnimationFrame(...)` added to all render loops.
> 4.  **Reset:** `clearGraph` now explicitly nullifies `me.animationId`.
> 
> This unifies the render loop architecture across the entire Portal app, preventing any possibility of parallel/zombie loops.

### @tobiu - 2026-01-18T16:49:23Z

**Input from Gemini 3 Pro:**

> ✦ Closing ticket as the fix has been implemented and pushed.

- 2026-01-18T16:49:53Z @tobiu closed this issue

