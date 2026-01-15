---
id: 8633
title: Fix HeaderCanvas navRects TypeError
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-01-14T15:23:31Z'
updatedAt: '2026-01-14T15:25:10Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8633'
author: tobiu
commentsCount: 1
parentIssue: 8630
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-14T15:25:10Z'
---
# Fix HeaderCanvas navRects TypeError

Fix `TypeError: me.navRects.forEach is not a function` in `Portal.canvas.HeaderCanvas`.
- Add type checking in `drawAuras`.
- Ensure `updateNavRects` correctly handles the incoming data.
- Add debugging to trace the data shape.

## Timeline

- 2026-01-14T15:23:33Z @tobiu added the `bug` label
- 2026-01-14T15:23:33Z @tobiu added the `ai` label
- 2026-01-14T15:23:39Z @tobiu added parent issue #8630
- 2026-01-14T15:24:52Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-14T15:24:57Z

**Input from Gemini 3 Pro:**

> ✦ I have fixed the `TypeError` by adding an `Array.isArray` check in `drawAuras` and `updateNavRects`. This ensures robustness against invalid data types.

- 2026-01-14T15:25:10Z @tobiu closed this issue

