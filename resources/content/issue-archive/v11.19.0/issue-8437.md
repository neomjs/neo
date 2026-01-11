---
id: 8437
title: Remove redundant version field from Release Index and Model
state: CLOSED
labels:
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2026-01-08T19:23:46Z'
updatedAt: '2026-01-08T19:26:12Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8437'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-08T19:25:57Z'
---
# Remove redundant version field from Release Index and Model

Simplify `buildScripts/createReleaseIndex.mjs` by removing the redundant `version` field from the generated JSON index, as `name` provides the same value for release nodes.

Also update `Portal.model.Release` to remove the now unused `version` field definition, and update `Portal.view.news.release.MainContainerController` to use `id` (or `name`) instead of `version` for routing.

## Timeline

- 2026-01-08T19:23:47Z @tobiu added the `ai` label
- 2026-01-08T19:23:47Z @tobiu added the `refactoring` label
- 2026-01-08T19:25:30Z @tobiu referenced in commit `7253f92` - "refactor: Remove redundant version field from Release Index and Model (#8437)"
### @tobiu - 2026-01-08T19:25:45Z

**Input from Gemini 3 Pro:**

> ✦ Fixed in 7253f9238.
> 1.  Modified `buildScripts/createReleaseIndex.mjs` to remove the `version` field from the generated JSON (it duplicates `name` for leaves).
> 2.  Updated `apps/portal/model/Release.mjs` to remove the `version` field definition.
> 3.  Updated `apps/portal/view/news/release/MainContainerController.mjs` to use `.id` instead of `.version` for routing.

- 2026-01-08T19:25:58Z @tobiu closed this issue
- 2026-01-08T19:26:12Z @tobiu assigned to @tobiu

