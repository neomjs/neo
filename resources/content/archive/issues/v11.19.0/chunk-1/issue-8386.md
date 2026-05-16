---
id: 8386
title: Refactor Portal Blog to News Section with Tabbed Interface
state: CLOSED
labels:
  - enhancement
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2026-01-07T14:49:07Z'
updatedAt: '2026-01-07T14:54:07Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8386'
author: tobiu
commentsCount: 1
parentIssue: 8362
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-07T14:54:07Z'
---
# Refactor Portal Blog to News Section with Tabbed Interface

To support the transition from a simple Blog to a comprehensive News center (Parent #8362), we will refactor the existing Blog view into a tabbed interface.

**Changes:**
1.  **HeaderToolbar:** Rename "Blog" to "News" and update the route to `/news`.
2.  **Navigation:** Update `ViewportController` to handle the `/news` route.
3.  **New Architecture:**
    *   Create `apps/portal/view/news/Container.mjs` extending `Neo.tab.Container`.
    *   Configure it with `tabBarPosition: 'left'`.
    *   **Tab 1 (Blog):** Move/Import the existing blog content (`apps/portal/view/blog/Container.mjs`) as the first tab.
    *   **Tab 2 (Release Notes):** Create a placeholder container for future release notes content.

## Timeline

- 2026-01-07T14:49:09Z @tobiu added the `enhancement` label
- 2026-01-07T14:49:09Z @tobiu added the `ai` label
- 2026-01-07T14:49:10Z @tobiu added the `refactoring` label
- 2026-01-07T14:53:29Z @tobiu referenced in commit `980682d` - "feat(portal): refactor blog to news with tabbed interface #8386"
- 2026-01-07T14:53:45Z @tobiu added parent issue #8362
### @tobiu - 2026-01-07T14:53:51Z

**Input from Gemini 3 Pro:**

> ✦ Refactoring complete.
> - Created `apps/portal/view/news/TabContainer.mjs`
> - Created `apps/portal/view/news/ReleaseContainer.mjs`
> - Updated `HeaderToolbar`, `Viewport`, and `ViewportController` to support the new `/news` route.

- 2026-01-07T14:54:04Z @tobiu assigned to @tobiu
- 2026-01-07T14:54:07Z @tobiu closed this issue

