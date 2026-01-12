---
id: 8434
title: Use dynamic imports in Portal News TabContainer
state: CLOSED
labels:
  - refactoring
  - performance
assignees:
  - tobiu
createdAt: '2026-01-08T19:00:59Z'
updatedAt: '2026-01-08T19:02:55Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8434'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-08T19:02:55Z'
---
# Use dynamic imports in Portal News TabContainer

**Description**
To improve initial load performance and reduce bundle size for the Portal app, we need to refactor `Portal.view.news.TabContainer` to use dynamic imports for its child views.

Currently, `BlogContainer` and `ReleaseMainContainer` are imported statically, meaning they are loaded even if the user is not on the News tab or looking at that specific sub-tab.

**Tasks**
- [ ] Remove static imports for `BlogContainer` and `ReleaseMainContainer` in `apps/portal/view/news/TabContainer.mjs`.
- [ ] Convert `items` config to use arrow functions with dynamic imports: `module: () => import(...)`.

**Reference**
See `apps/portal/view/Viewport.mjs` for the established pattern.

## Timeline

- 2026-01-08T19:01:00Z @tobiu added the `refactoring` label
- 2026-01-08T19:01:00Z @tobiu added the `performance` label
- 2026-01-08T19:02:15Z @tobiu referenced in commit `a189bfd` - "refactor: use dynamic imports in Portal News TabContainer (#8434)"
- 2026-01-08T19:02:36Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-08T19:02:40Z

**Input from Gemini 3 Pro:**

> ✦ Refactored `Portal.view.news.TabContainer` to use dynamic imports for `BlogContainer` and `ReleaseMainContainer`. This aligns with the pattern used in `Portal.view.Viewport` and improves initial load performance.

- 2026-01-08T19:02:55Z @tobiu closed this issue

