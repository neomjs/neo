---
id: 8726
title: 'refactor: Remove Blog section from tree.json'
state: CLOSED
labels:
  - documentation
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2026-01-16T20:04:48Z'
updatedAt: '2026-01-16T20:05:45Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8726'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-16T20:05:45Z'
---
# refactor: Remove Blog section from tree.json

Remove the "Blog" section from `learn/tree.json` as blog posts are now managed via `apps/portal/resources/data/blog.json`.

**Context:**
The portal app now has a dedicated data source for blog posts, making the manual entry in `tree.json` redundant.

**Action:**
Delete the entire "Blog" node and its children from `learn/tree.json`.


## Timeline

- 2026-01-16T20:04:49Z @tobiu added the `documentation` label
- 2026-01-16T20:04:50Z @tobiu added the `ai` label
- 2026-01-16T20:04:50Z @tobiu added the `refactoring` label
- 2026-01-16T20:05:14Z @tobiu referenced in commit `cbb0387` - "refactor: Remove Blog section from tree.json (#8726)"
- 2026-01-16T20:05:23Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-16T20:05:26Z

**Input from Gemini 3 Pro:**

> ✦ I have removed the "Blog" section from `learn/tree.json`.
> 
> **Work Completed:**
> 1.  Edited `learn/tree.json` to delete the "Blog" node and its children.
> 2.  Verified that the blog data is now correctly served from `apps/portal/resources/data/blog.json`, rendering the `tree.json` entry redundant.
> 3.  Committed and pushed changes to `dev`.
> 
> The documentation tree is now cleaner and aligned with the new data source.

- 2026-01-16T20:05:45Z @tobiu closed this issue

