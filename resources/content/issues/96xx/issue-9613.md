---
id: 9613
title: 'Grid Multi-Body: Fix horizontal DragScroll and Mousewheel translation'
state: CLOSED
labels:
  - bug
  - ai
  - grid
assignees:
  - tobiu
createdAt: '2026-03-31T14:58:47Z'
updatedAt: '2026-03-31T15:00:25Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9613'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-31T15:00:25Z'
---
# Grid Multi-Body: Fix horizontal DragScroll and Mousewheel translation

**Problem:**
Under the new Multi-Body Architecture, the horizontal scroll container has been decoupled into the \`HorizontalScrollbar\`, and the \`bodyWrapper\` operates under \`overflow-x: hidden\`. This decoupling caused the browser to ignore native horizontal trackpad panning (wheel events) within the grid body. Additionally, the \`GridDragScroll\` addon still targets the old \`gridContainer\` for horizontal updates instead of the new decoupled scrollbar.

**Solution:**
1. Update \`ScrollManager.mjs\` to explicitly pass the decoupled \`horizontalScrollbar?.id\` as the \`containerId\` for \`GridDragScroll.mjs\`.
2. Enhance \`GridHorizontalScrollSync.mjs\` to intercept \`wheel\` events on the \`bodyWrapper\` and forward any \`deltaX\` movement directly to the \`HorizontalScrollbar\`, seamlessly bridging trackpad scrolling back into the sync loop.

## Timeline

- 2026-03-31T14:58:49Z @tobiu added the `bug` label
- 2026-03-31T14:58:49Z @tobiu added the `ai` label
- 2026-03-31T14:58:49Z @tobiu added the `grid` label
- 2026-03-31T15:00:06Z @tobiu referenced in commit `d9d181d` - "fix: Restore horizontal trackpad and drag scrolling under Multi-Body Architecture (#9613)"
- 2026-03-31T15:00:14Z @tobiu assigned to @tobiu
### @tobiu - 2026-03-31T15:00:23Z

Resolved. The 'overflow-x: hidden' on the new wrapper-based Multi-Body approach blocked horizontal events natively. I restored native physics by bridging horizontal trackpad events directly inside 'GridHorizontalScrollSync.mjs' and redirecting the target 'containerId' internally inside 'ScrollManager' so that GridDragScroll modifies the decoupled horizontal scrollbar.

- 2026-03-31T15:00:25Z @tobiu closed this issue
- 2026-03-31T15:02:41Z @tobiu cross-referenced by #9489

