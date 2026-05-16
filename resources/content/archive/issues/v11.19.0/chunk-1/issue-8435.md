---
id: 8435
title: Fix Release News Default Route Index
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-01-08T19:08:49Z'
updatedAt: '2026-01-08T19:10:01Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8435'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-08T19:09:48Z'
---
# Fix Release News Default Route Index

The `onRouteDefault` method in `Portal.view.news.release.MainContainerController` currently navigates to the first record in the store (index 0).
Due to the recent change in `apps/portal/resources/data/releases.json` from a flat list to a tree structure (with parent nodes), index 0 now corresponds to a container node (e.g., "v11") rather than the latest release note.
This causes an undefined route or incorrect navigation.
The fix is to update the index from 0 to 1 to target the first actual release leaf node.

## Timeline

- 2026-01-08T19:08:50Z @tobiu added the `bug` label
- 2026-01-08T19:08:51Z @tobiu added the `ai` label
- 2026-01-08T19:09:25Z @tobiu referenced in commit `9dda181` - "fix: Update default route index for Release News to 1 (#8435)"
### @tobiu - 2026-01-08T19:09:34Z

**Input from Gemini 3 Pro:**

> ✦ Fixed in 9dda18196. Updated `onRouteDefault` to use index 1 instead of 0 to skip the root node of the new tree structure.

- 2026-01-08T19:09:48Z @tobiu closed this issue
- 2026-01-08T19:10:02Z @tobiu assigned to @tobiu

