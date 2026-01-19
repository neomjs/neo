---
id: 8794
title: 'Refactor Portal Canvases: Promote mouse handling and common state to Base class'
state: CLOSED
labels:
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2026-01-19T01:03:02Z'
updatedAt: '2026-01-19T01:10:06Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8794'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-19T01:10:05Z'
---
# Refactor Portal Canvases: Promote mouse handling and common state to Base class

Further enhance `Portal.canvas.Base` by promoting common state and mouse handling logic found in 3/4 canvas subclasses.

**Goals:**
1.  **Promote State Fields:** Move `mouse`, `gradients`, and `time` to `Portal.canvas.Base`.
2.  **Promote Logic:** Implement a generic `updateMouseState` in `Base` that handles position tracking.
3.  **Implement Hook:** Add `onMouseClick(data)` hook in `Base` (called by `updateMouseState`).
4.  **Refactor Subclasses:**
    *   `HomeCanvas`, `ServicesCanvas`, `HeaderCanvas`: Remove redundant fields/methods.
    *   Convert their specific `updateMouseState` logic into `onMouseClick` implementations.
5.  **Cleanup:** Ensure `Base.clearGraph` resets the new fields.


## Timeline

- 2026-01-19T01:03:03Z @tobiu added the `ai` label
- 2026-01-19T01:03:03Z @tobiu added the `refactoring` label
- 2026-01-19T01:09:27Z @tobiu referenced in commit `a2e0c29` - "refactor: Promote mouse handling and common state to Portal.canvas.Base (#8794)"
- 2026-01-19T01:09:48Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-19T01:09:53Z

**Input from Gemini 3 Pro:**

> ✦ Refactoring complete. `Portal.canvas.Base` now manages `mouse`, `time`, and `gradients`. The `updateMouseState` method is centralized in the base class, and subclasses use the `onMouseClick` hook for specific interaction logic. Redundant code has been removed from `HomeCanvas`, `ServicesCanvas`, and `HeaderCanvas`.

- 2026-01-19T01:10:06Z @tobiu closed this issue

