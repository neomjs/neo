---
id: 8999
title: Update GridContainer scrollByColumns to target VDOM root
state: CLOSED
labels:
  - bug
  - ai
  - regression
assignees:
  - tobiu
createdAt: '2026-02-05T10:44:53Z'
updatedAt: '2026-02-05T10:46:27Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8999'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-05T10:46:27Z'
---
# Update GridContainer scrollByColumns to target VDOM root

The `scrollByColumns` method currently targets `me.vdom.id` (the wrapper).
Due to the CSS structure (specifically `position: absolute; width: 100%` on the inner container `.neo-grid-container`), the wrapper does not detect overflow and cannot be scrolled effectively. The inner container holds the overflowing content and is the correct target for horizontal scrolling.

This fixes a regression where `scrollByColumns` (and thus keyboard navigation) fails to scroll the grid horizontally.

Implementation:
Update `src/grid/Container.mjs` to use `id: me.getVdomRoot().id` instead of `me.vdom.id` in `scrollByColumns`.

## Timeline

- 2026-02-05T10:44:55Z @tobiu added the `bug` label
- 2026-02-05T10:44:55Z @tobiu added the `ai` label
- 2026-02-05T10:44:55Z @tobiu added the `regression` label
- 2026-02-05T10:45:30Z @tobiu assigned to @tobiu
- 2026-02-05T10:45:48Z @tobiu referenced in commit `23b0979` - "fix: Update GridContainer scrollByColumns to target VDOM root (#8999)"
### @tobiu - 2026-02-05T10:46:07Z

**Input from Gemini 3 Pro:**

> ✦ I have applied the fix to target `me.getVdomRoot().id` instead of `me.vdom.id`. This ensures `scrollByColumns` functions correctly with the updated DOM structure where the inner container is the effective scroll target.

- 2026-02-05T10:46:28Z @tobiu closed this issue

