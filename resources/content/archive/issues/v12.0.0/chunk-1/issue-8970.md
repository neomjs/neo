---
id: 8970
title: 'feat: Commit base implementation of Neo.grid.Row and refactored GridBody (#8964)'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-03T20:50:45Z'
updatedAt: '2026-02-03T20:52:11Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8970'
author: tobiu
commentsCount: 1
parentIssue: 8964
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-03T20:52:11Z'
---
# feat: Commit base implementation of Neo.grid.Row and refactored GridBody (#8964)

The initial implementation of `Neo.grid.Row` and the refactored `Neo.grid.Body` are now functional for initial rendering and vertical scrolling (row buffering).

**Completed Work:**
- `Neo.grid.Row` component created with `createVdom` logic.
- `Neo.grid.Body` refactored to use Row Pooling.
- Race conditions in `GridBody` fixed (column position mutation listener).
- Crash in `Row.mjs` fixed (missing column position guard).
- `Row.mjs` optimized to use `me._vdom = vdom; me.update()` for better performance/stability.

**Current State:**
- Grid renders correctly on load.
- Vertical scrolling works (rows are recycled).
- **Known Issue:** Horizontal scrolling (column buffering) is currently broken and will be addressed in a follow-up ticket.

This ticket tracks the commitment of the current stable base to the feature branch.

## Timeline

- 2026-02-03T20:50:46Z @tobiu added the `enhancement` label
- 2026-02-03T20:50:46Z @tobiu added the `ai` label
- 2026-02-03T20:51:30Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-03T20:51:43Z

**Input from Gemini 3 Pro:**

> ✦ I have successfully committed and pushed the base implementation of `Neo.grid.Row` and the refactored `Neo.grid.Body`.
> - **Initial rendering:** Functional.
> - **Vertical scrolling:** Functional.
> - **Horizontal scrolling:** Pending implementation.
> 
> The code is now safe in the feature branch. I will now close this ticket as the commitment is complete.

- 2026-02-03T20:51:57Z @tobiu added parent issue #8964
- 2026-02-03T20:52:11Z @tobiu closed this issue
- 2026-02-03T20:53:26Z @tobiu referenced in commit `f691b3f` - "feat: Commit base implementation of Neo.grid.Row and refactored GridBody (#8970)"
- 2026-02-03T21:00:45Z @tobiu cross-referenced by #8971

