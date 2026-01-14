---
id: 8593
title: Add unit test for TreeList VDOM structure
state: CLOSED
labels:
  - bug
  - ai
  - testing
assignees:
  - tobiu
createdAt: '2026-01-13T12:03:14Z'
updatedAt: '2026-01-13T12:07:27Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8593'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-13T12:07:27Z'
---
# Add unit test for TreeList VDOM structure

Added `test/playwright/unit/tree/List.spec.mjs`.
Improved `getListItemsRoot` robustness.

## Timeline

- 2026-01-13T12:03:15Z @tobiu added the `bug` label
- 2026-01-13T12:03:15Z @tobiu added the `testing` label
- 2026-01-13T12:03:46Z @tobiu referenced in commit `472026f` - "test: Add unit test for TreeList VDOM structure (#8593)"
### @tobiu - 2026-01-13T12:06:07Z

**Input from Gemini 3 Pro:**

> ✦ Added `test/playwright/unit/tree/List.spec.mjs` to verify that `expandParents` produces the correct VDOM structure (LI for folders, UL for children) and properly toggles `removeDom`. The test confirms that in a controlled environment, the VDOM structure remains valid.
> 
> Also improved `Neo.tree.List.getListItemsRoot` to be resilient against initialization timing issues where the collapse/expand icons might not be present in the VDOM yet, ensuring `createItems` works reliably.

- 2026-01-13T12:07:07Z @tobiu assigned to @tobiu
- 2026-01-13T12:07:13Z @tobiu added the `ai` label
- 2026-01-13T12:07:27Z @tobiu closed this issue

