---
id: 8585
title: Add Blog Tab to Portal News Section
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-13T09:02:48Z'
updatedAt: '2026-01-13T09:39:12Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8585'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-13T09:39:12Z'
---
# Add Blog Tab to Portal News Section

We want to add a new "Blog" tab to the Portal News section (`apps/portal/view/news/TabContainer.mjs`). This tab will display blog posts hosted directly in the repository (under `learn/blog`), similar to how Releases are currently displayed.

**Tasks:**
1.  Create `apps/portal/resources/data/blog.json` by extracting relevant data from `learn/tree.json`.
2.  Duplicate `apps/portal/view/news/release` to `apps/portal/view/news/blog`.
3.  Refactor the new view classes to use `Portal.view.news.blog` namespace and point to the new `blog.json`.
4.  Update `apps/portal/view/news/TabContainer.mjs` to include the new tab and rename the existing "Blog" tab to "Medium".


## Timeline

- 2026-01-13T09:02:49Z @tobiu added the `documentation` label
- 2026-01-13T09:02:49Z @tobiu added the `enhancement` label
- 2026-01-13T09:02:49Z @tobiu added the `ai` label
- 2026-01-13T09:38:41Z @tobiu referenced in commit `6f244df` - "feat: Add Blog tab to Portal News and rename existing Blog to Medium (#8585)

- Rename existing 'Blog' view to 'Medium'
    - Move  to
    - Update class names and references (blog-list -> medium-list)
    - Update SCSS variables and file paths
    - Rename  to
- Add new 'Blog' view (Markdown-based)
    - Clone  to
    - Generate  from
    - Create  and
- Update
    - Add new 'Blog' tab with  icon
    - Update 'Medium' tab with  icon
    - Update  routes
- Update
    - Rename  to"
### @tobiu - 2026-01-13T09:38:46Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the new Blog tab and renamed the existing Blog section to Medium.
> 
> **Changes:**
> - **Renamed 'Blog' to 'Medium':**
>   - Moved `apps/portal/view/news/blog` to `apps/portal/view/news/medium`.
>   - Updated `Container.mjs` and `List.mjs` to reflect the new namespace and CSS classes (`medium-list`).
>   - Updated `ViewportController` to use `onMediumSearchFieldChange`.
>   - Renamed `blog.json` to `medium_blog.json`.
>   - Updated SCSS variables and paths.
> - **Added new 'Blog' Tab:**
>   - Cloned `release` view structure to `apps/portal/view/news/blog`.
>   - Created `Portal.model.Blog` and `Portal.store.Blog`.
>   - Generated `apps/portal/resources/data/blog.json` from `learn/tree.json`.
> - **Updated `TabContainer`:**
>   - Added the new Blog tab with the `neo-logo-blue` icon.
>   - Updated the Medium tab with the `fab fa-medium` icon.
>   - Updated routing in `TabContainerController`.
> 
> The changes have been pushed to `origin/dev`.

- 2026-01-13T09:39:02Z @tobiu assigned to @tobiu
- 2026-01-13T09:39:12Z @tobiu closed this issue

