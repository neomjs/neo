---
id: 8982
title: Fix Grid Horizontal Keyboard Scrolling
state: CLOSED
labels:
  - bug
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2026-02-04T11:48:36Z'
updatedAt: '2026-02-04T11:51:51Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8982'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-04T11:51:51Z'
---
# Fix Grid Horizontal Keyboard Scrolling

**Problem:** Horizontal keyboard navigation (Left/Right arrows) in the Grid fails to scroll the container when reaching the edge of the visible area.
**Cause:** `Neo.grid.Container.scrollByColumns` calls `Neo.main.DomAccess.scrollTo` using `id: me.id`. However, `GridContainer` overrides its root VDOM ID to `me.getWrapperId()` (suffix `__wrapper`). Therefore, the `scrollTo` call targets a non-existent DOM ID and fails silently.
**Fix:** Update `scrollByColumns` to use `id: me.vdom.id` (or `me.getWrapperId()`).

## Timeline

- 2026-02-04T11:48:37Z @tobiu added the `bug` label
- 2026-02-04T11:48:37Z @tobiu added the `ai` label
- 2026-02-04T11:48:37Z @tobiu added the `refactoring` label
- 2026-02-04T11:50:55Z @tobiu referenced in commit `188e238` - "fix: Target correct DOM ID for Grid horizontal scrolling (#8982)"
### @tobiu - 2026-02-04T11:51:02Z

**Input from Gemini 3 Pro:**

> ✦ Fixed horizontal scrolling bug in `GridContainer`.
> `scrollByColumns` was targeting `me.id` instead of `me.vdom.id` (which carries the `__wrapper` suffix). Updated to use `me.vdom.id` to ensure `DomAccess.scrollTo` finds the correct scrollable element.

- 2026-02-04T11:51:08Z @tobiu assigned to @tobiu
- 2026-02-04T11:51:52Z @tobiu closed this issue

