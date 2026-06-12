---
id: 8438
title: Remove redundant name field from Release Index and Model
state: CLOSED
labels:
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2026-01-08T19:27:00Z'
updatedAt: '2026-01-08T19:29:38Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8438'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-08T19:29:38Z'
---
# Remove redundant name field from Release Index and Model

The `name` field in the Release Index and Model is identical to the `id` field for both leaf and group nodes.
To further reduce redundancy:
1. Remove `name` assignment in `buildScripts/createReleaseIndex.mjs`.
2. Remove `name` field from `apps/portal/model/Release.mjs`.
3. Update `treeNodeName` calculation to use `id` instead of `name`.

## Timeline

- 2026-01-08T19:27:01Z @tobiu added the `ai` label
- 2026-01-08T19:27:01Z @tobiu added the `refactoring` label
- 2026-01-08T19:28:51Z @tobiu referenced in commit `bb30999` - "refactor: Remove redundant name field from Release Index and Model (#8438)"
### @tobiu - 2026-01-08T19:29:14Z

**Input from Gemini 3 Pro:**

> ✦ Fixed in bb3099952.
> 1.  Removed `name` assignment and property from `buildScripts/createReleaseIndex.mjs`.
> 2.  Removed `name` field from `apps/portal/model/Release.mjs`.
> 3.  Updated `treeNodeName` calculation to use `id` as the source of truth.

- 2026-01-08T19:29:26Z @tobiu assigned to @tobiu
- 2026-01-08T19:29:39Z @tobiu closed this issue

