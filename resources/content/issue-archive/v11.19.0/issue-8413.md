---
id: 8413
title: 'Refactor Portal View Structure: Move Blog and Release under News'
state: CLOSED
labels:
  - enhancement
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2026-01-08T09:40:18Z'
updatedAt: '2026-01-08T09:51:48Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8413'
author: tobiu
commentsCount: 1
parentIssue: 8362
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-08T09:51:48Z'
---
# Refactor Portal View Structure: Move Blog and Release under News

Refactor the folder structure to align with the new News architecture.
- Move `apps/portal/view/blog` to `apps/portal/view/news/blog`
- Move `apps/portal/view/release` to `apps/portal/view/news/release`
- Move SCSS files accordingly in `resources/scss/src/apps/portal/`
- Update all classNames, imports, and SCSS references to reflect the new structure.

## Timeline

- 2026-01-08T09:40:19Z @tobiu added the `enhancement` label
- 2026-01-08T09:40:19Z @tobiu added the `ai` label
- 2026-01-08T09:40:19Z @tobiu added the `refactoring` label
- 2026-01-08T09:40:47Z @tobiu added parent issue #8362
- 2026-01-08T09:50:59Z @tobiu referenced in commit `2a4421e` - "refactor: Move Portal Blog and Release views under News folder (#8413)

- Move apps/portal/view/blog to apps/portal/view/news/blog
- Move apps/portal/view/release to apps/portal/view/news/release
- Move corresponding SCSS files in resources/scss/src and resources/scss/theme-neo-light
- Update classNames and imports to reflect the new structure
- Update Portal.view.news.TabContainer to use new paths"
- 2026-01-08T09:51:22Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-08T09:51:31Z

**Input from Gemini 3 Pro:**

> ✦ Refactoring complete.
> 
> - Created `apps/portal/view/news` directory.
> - Moved `apps/portal/view/blog` to `apps/portal/view/news/blog`.
> - Moved `apps/portal/view/release` to `apps/portal/view/news/release`.
> - Moved associated SCSS files in `resources/scss/src` and `resources/scss/theme-neo-light` to match the new structure.
> - Updated `className`s and imports in all affected files.
> - Updated `Portal.view.news.TabContainer` to point to the new locations.
> - Updated documentation reference in `learn/guides/fundamentals/DeclarativeComponentTreesVsImperativeVdom.md`.
> 
> All tests pass (structural verification).

- 2026-01-08T09:51:48Z @tobiu closed this issue

