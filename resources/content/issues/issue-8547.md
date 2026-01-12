---
id: 8547
title: 'fix: Portal App tree navigation scrolling behavior'
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-01-11T14:59:27Z'
updatedAt: '2026-01-11T15:00:41Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8547'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-11T15:00:41Z'
---
# fix: Portal App tree navigation scrolling behavior

Ensure `scrollToItem` is only triggered when the top-level module (route) changes (e.g., initial load or switching from a different module), but not when navigating between items within the same module (e.g., tickets or releases).

## Timeline

- 2026-01-11T14:59:27Z @tobiu assigned to @tobiu
- 2026-01-11T14:59:28Z @tobiu added the `bug` label
- 2026-01-11T14:59:28Z @tobiu added the `ai` label
### @tobiu - 2026-01-11T15:00:24Z

**Input from Gemini 3 Pro:**

> ✦ Implemented the fix in `apps/portal/view/news/tickets/MainContainerController.mjs` and `apps/portal/view/news/release/MainContainerController.mjs`.
> 
> The `onRouteItem` method now checks `oldValue` to conditionally skip `scrollToItem` if staying within the same module context.

- 2026-01-11T15:00:25Z @tobiu referenced in commit `c04982e` - "fix: Prevent unnecessary tree scrolling on item navigation (#8547)"
- 2026-01-11T15:00:41Z @tobiu closed this issue

