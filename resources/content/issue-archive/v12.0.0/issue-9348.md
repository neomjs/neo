---
id: 9348
title: 'GridDragScroll: Prevent Intervention error on touchmove'
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-02-28T02:07:27Z'
updatedAt: '2026-02-28T02:08:32Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9348'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-28T02:08:32Z'
---
# GridDragScroll: Prevent Intervention error on touchmove

When scrolling the grid on a mobile device, the browser throws an intervention error:
`[Intervention] Ignored attempt to cancel a touchmove event with cancelable=false, for example because scrolling is in progress and cannot be interrupted.`

**Cause:**
In `src/main/addon/GridDragScroll.mjs`, we are calling `event.preventDefault()` on `touchmove` unconditionally. If the browser has already decided the event is part of a native scroll and cannot be cancelled, it throws this warning/error.

**Fix:**
We need to check `event.cancelable !== false` before calling `preventDefault()`.

See: https://developers.google.com/web/updates/2017/01/scrolling-intervention

## Timeline

- 2026-02-28T02:07:27Z @tobiu assigned to @tobiu
- 2026-02-28T02:07:28Z @tobiu added the `bug` label
- 2026-02-28T02:07:28Z @tobiu added the `ai` label
- 2026-02-28T02:08:11Z @tobiu referenced in commit `c8d1fe7` - "fix(grid): Prevent intervention error by checking cancelable on touchmove (#9348)

GridDragScroll ignored attempt to cancel a touchmove event with cancelable=false, for example because scrolling is in progress and cannot be interrupted."
### @tobiu - 2026-02-28T02:08:17Z

**Input from Gemini 3.1 Pro:**

> ✦ I have fixed the issue by checking `event.cancelable !== false` before calling `event.preventDefault()` on `touchmove` events in `GridDragScroll.mjs`.
> 
> The fix is committed and pushed to `dev`.

- 2026-02-28T02:08:33Z @tobiu closed this issue

