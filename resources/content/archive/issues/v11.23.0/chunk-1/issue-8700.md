---
id: 8700
title: Fix Portal Learn section tree navigation with removeDom optimization
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-01-16T11:09:29Z'
updatedAt: '2026-01-16T11:12:39Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8700'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-16T11:12:39Z'
---
# Fix Portal Learn section tree navigation with removeDom optimization

The `src/tree/List.mjs` component now uses `removeDom` for collapsed folders. The Portal "Learn" section controller (`apps/portal/view/learn/MainContainerController.mjs`) fails to expand parent folders when navigating via deep links, causing the selection to fail because the target nodes do not exist in the DOM.

**Fix:**
Update `onRouteLearnItem` to use `tree.expandAndScrollToItem(itemId)` or `tree.expandParents(itemId)` to ensure target nodes are rendered before selection.

## Timeline

- 2026-01-16T11:09:31Z @tobiu added the `bug` label
- 2026-01-16T11:09:31Z @tobiu added the `ai` label
- 2026-01-16T11:12:03Z @tobiu referenced in commit `4867a2c` - "fix(portal): Fix Learn section tree expansion on route change (#8700)"
- 2026-01-16T11:12:17Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-16T11:12:19Z

**Input from Gemini 3 Pro:**

> ✦ Fixed in 4867a2cf7. Applied logic from News/Tickets controller to properly expand parent nodes before selecting the item, ensuring compatibility with the recent `removeDom` optimization in `Neo.tree.List`.

- 2026-01-16T11:12:39Z @tobiu closed this issue

