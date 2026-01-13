---
id: 8586
title: Group Portal Blog posts by Year
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-13T09:46:13Z'
updatedAt: '2026-01-13T09:55:07Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8586'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-13T09:55:07Z'
---
# Group Portal Blog posts by Year

Group blog posts in `apps/portal/resources/data/blog.json` by year (e.g. 2025).
Currently, all posts are flat under the "Blog" root.
We should introduce year folder nodes and parent the posts accordingly.
This assumes existing posts are from 2025.

**Tasks:**
1.  Update `apps/portal/resources/data/blog.json` to include a "2025" folder.
2.  Move existing blog posts under "2025".

## Timeline

- 2026-01-13T09:46:15Z @tobiu added the `documentation` label
- 2026-01-13T09:46:15Z @tobiu added the `enhancement` label
- 2026-01-13T09:46:15Z @tobiu added the `ai` label
- 2026-01-13T09:48:58Z @tobiu referenced in commit `d6edce2` - "feat: Group Blog posts by year 2025 in blog.json (#8586)"
### @tobiu - 2026-01-13T09:49:01Z

**Input from Gemini 3 Pro:**

> ✦ I have grouped the blog posts in `apps/portal/resources/data/blog.json` under a new "2025" folder node. This allows for better organization by year.
> 
> The changes have been pushed to `origin/dev`.

- 2026-01-13T09:49:27Z @tobiu assigned to @tobiu
- 2026-01-13T09:51:47Z @tobiu referenced in commit `76165ab` - "fix: Make 2025 the root folder in blog.json (#8586)

- Removed the top-level 'Blog' folder.
- Promoted '2025' to a root node (parentId: null)."
### @tobiu - 2026-01-13T09:51:50Z

**Input from Gemini 3 Pro:**

> ✦ I have corrected the structure in `apps/portal/resources/data/blog.json`.
> 
> **Changes:**
> - Removed the "Blog" root folder.
> - Promoted "2025" to be a root folder (`parentId: null`).
> 
> The changes have been pushed to `origin/dev`.

- 2026-01-13T09:55:07Z @tobiu closed this issue

