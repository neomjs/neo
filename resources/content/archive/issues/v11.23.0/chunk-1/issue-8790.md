---
id: 8790
title: Refactor Portal Canvases to optimize animation loop
state: CLOSED
labels:
  - ai
  - refactoring
  - performance
assignees:
  - tobiu
createdAt: '2026-01-19T00:10:57Z'
updatedAt: '2026-01-19T00:14:37Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8790'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-19T00:14:37Z'
---
# Refactor Portal Canvases to optimize animation loop

Apply the optimization pattern from `TicketCanvas.mjs` to `HeaderCanvas`, `HomeCanvas`, and `ServicesCanvas`.
- Remove `animationId_` from reactive config to avoid overhead in the render loop.
- Use a class field for `animationId`.
- Add `!me.animationId` check in `initGraph` to prevent duplicate loops.
- Ensure `clearGraph` properly resets the state.

## Timeline

- 2026-01-19T00:10:58Z @tobiu added the `ai` label
- 2026-01-19T00:10:58Z @tobiu added the `refactoring` label
- 2026-01-19T00:10:59Z @tobiu added the `performance` label
- 2026-01-19T00:14:00Z @tobiu referenced in commit `64d6507` - "refactor: optimize animation loops in Portal canvases (#8790)"
- 2026-01-19T00:14:14Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-19T00:14:19Z

**Input from Gemini 3 Pro:**

> ✦ I have refactored `HeaderCanvas.mjs`, `HomeCanvas.mjs`, and `ServicesCanvas.mjs` to optimize the animation loop pattern.
> 
> **Changes:**
> - **Performance:** Removed `animationId_` from the reactive `static config`. It is now a standard class field, preventing the overhead of `afterSet` hooks triggering on every frame (60fps).
> - **Stability:** Updated `initGraph()` in all three canvases to check `!me.animationId` before starting the render loop. This prevents accidental "Zombie Loops" (duplicate render loops running in parallel) if `initGraph` is called multiple times.
> - **Cleanup:** Removed the now-redundant `afterSetAnimationId` methods.
> 
> The canvases now follow the stabilized pattern established in `TicketCanvas.mjs`.

- 2026-01-19T00:14:37Z @tobiu closed this issue

