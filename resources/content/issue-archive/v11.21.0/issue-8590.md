---
id: 8590
title: Refactor Portal Blog Models and Stores to resolve ambiguity
state: CLOSED
labels:
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2026-01-13T10:30:13Z'
updatedAt: '2026-01-13T10:47:44Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8590'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-13T10:47:44Z'
---
# Refactor Portal Blog Models and Stores to resolve ambiguity

Rename Portal models and stores to distinguish between internal Neo blog posts and external Medium posts.

*   `apps/portal/model/Blog.mjs` -> `apps/portal/model/BlogNeo.mjs`
*   `apps/portal/store/Blog.mjs` -> `apps/portal/store/BlogNeo.mjs`
*   `apps/portal/model/BlogPost.mjs` -> `apps/portal/model/BlogMedium.mjs`
*   `apps/portal/store/BlogPosts.mjs` -> `apps/portal/store/BlogMedium.mjs`

Update all references in:
*   `apps/portal/view/news/blog`
*   `apps/portal/view/news/medium`
*   `apps/portal` (general search)

## Timeline

- 2026-01-13T10:30:14Z @tobiu added the `ai` label
- 2026-01-13T10:30:15Z @tobiu added the `refactoring` label
- 2026-01-13T10:46:50Z @tobiu referenced in commit `6e92e66` - "refactor: Rename Portal models and stores to resolve ambiguity (#8590)

Renamed files to distinguish between internal Neo blog and Medium posts:
- apps/portal/model/Blog.mjs -> apps/portal/model/BlogNeo.mjs
- apps/portal/store/Blog.mjs -> apps/portal/store/BlogNeo.mjs
- apps/portal/model/BlogPost.mjs -> apps/portal/model/BlogMedium.mjs
- apps/portal/store/BlogPosts.mjs -> apps/portal/store/BlogMedium.mjs

Updated all references in:
- apps/portal/view/news/blog/MainContainerStateProvider.mjs
- apps/portal/view/news/medium/List.mjs"
- 2026-01-13T10:47:20Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-13T10:47:28Z

**Input from Gemini 3 Pro:**

> ✦ Refactoring complete.
> - Renamed `Blog.mjs` to `BlogNeo.mjs` (Model and Store)
> - Renamed `BlogPost.mjs` to `BlogMedium.mjs` (Model)
> - Renamed `BlogPosts.mjs` to `BlogMedium.mjs` (Store)
> - Updated references in `apps/portal/view/news/blog` and `apps/portal/view/news/medium`.
> - Resolved name collisions in store files by aliasing model imports (`NeoBlogModel`, `MediumBlogModel`).

- 2026-01-13T10:47:44Z @tobiu closed this issue

