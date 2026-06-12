---
id: 8405
title: Reduce sidebar width for Release view
state: CLOSED
labels:
  - enhancement
  - design
  - ai
assignees:
  - tobiu
createdAt: '2026-01-08T00:22:16Z'
updatedAt: '2026-01-08T00:29:20Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8405'
author: tobiu
commentsCount: 1
parentIssue: 8362
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-08T00:29:20Z'
---
# Reduce sidebar width for Release view

Refine the layout of the Release view by reducing the sidebar width.
- Update `apps/portal/view/release/MainContainer.mjs` to include a specific CSS class.
- Create `resources/scss/src/apps/portal/release/MainContainer.scss` to override the default 350px width to 250px.
- Override lines 13, 14, and 21 of the base class SCSS.

## Timeline

- 2026-01-08T00:22:16Z @tobiu added the `enhancement` label
- 2026-01-08T00:22:17Z @tobiu added the `design` label
- 2026-01-08T00:22:17Z @tobiu added the `ai` label
- 2026-01-08T00:28:59Z @tobiu referenced in commit `71e075f` - "enhancement: Reduce sidebar width for Release view (#8405)"
- 2026-01-08T00:29:00Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-08T00:29:03Z

**Input from Gemini 3 Pro:**

> ✦ Implemented in 71e075fc3.
> 1. Updated `apps/portal/view/shared/content/Container.mjs` to use `baseCls: ['portal-shared-content-container', 'neo-container']`.
> 2. Updated `apps/portal/view/release/MainContainer.mjs` to use `cls: ['portal-release-maincontainer']`.
> 3. Created `resources/scss/src/apps/portal/release/MainContainer.scss` with overrides for `sidenav-container` width (250px).

- 2026-01-08T00:29:20Z @tobiu closed this issue
- 2026-01-08T00:29:42Z @tobiu added parent issue #8362

