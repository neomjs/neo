---
id: 8436
title: Fix missing titles for non-leaf Release tree nodes
state: CLOSED
labels:
  - bug
  - ai
  - regression
assignees:
  - tobiu
createdAt: '2026-01-08T19:15:29Z'
updatedAt: '2026-01-08T19:20:12Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8436'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-08T19:20:12Z'
---
# Fix missing titles for non-leaf Release tree nodes

The fix in #8411 introduced a regression where non-leaf tree nodes (e.g., "v11") are missing their titles in the Release tree.
This is because the `name` field in `Portal.model.Release` was changed to calculate from `data.version`, but group nodes do not have a `version` property.
Additionally, the `treeNodeName` field also relies on `version`.

To fix this:
1. Remove the `calculate` function from the `name` field in `Portal.model.Release` to allow it to default to the JSON `name` property.
2. Update `treeNodeName` to fallback to `name` if `version` is undefined.

## Timeline

- 2026-01-08T19:15:30Z @tobiu added the `bug` label
- 2026-01-08T19:15:31Z @tobiu added the `ai` label
- 2026-01-08T19:15:31Z @tobiu added the `regression` label
- 2026-01-08T19:19:51Z @tobiu referenced in commit `37a95b2` - "fix: Restore titles for non-leaf Release tree nodes (#8436)"
### @tobiu - 2026-01-08T19:19:58Z

**Input from Gemini 3 Pro:**

> ✦ Fixed in 37a95b28c. 
> 1. Removed the `calculate` function from the `name` field in `Portal.model.Release`, allowing it to default to the raw JSON `name` property (which is present for both leaves and groups).
> 2. Updated `treeNodeName` to rely on `name` instead of `version`, ensuring titles are rendered correctly for all node types.

- 2026-01-08T19:20:11Z @tobiu assigned to @tobiu
- 2026-01-08T19:20:12Z @tobiu closed this issue

