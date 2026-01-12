---
id: 8524
title: Enhance TreeList navigation for internal routing and deep linking
state: CLOSED
labels:
  - enhancement
  - ai
  - core
assignees:
  - tobiu
createdAt: '2026-01-10T21:15:51Z'
updatedAt: '2026-01-10T21:16:59Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8524'
author: tobiu
commentsCount: 1
parentIssue: 8398
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-10T21:16:59Z'
---
# Enhance TreeList navigation for internal routing and deep linking

**Goal:** Improve the user experience when navigating to deep-linked content (Tickets, Releases) within the Portal.

**Context:**
Currently, when a user clicks an internal ticket link (e.g., `#8398` resolved to `#/news/tickets/8398`), the correct content is fetched and displayed in the center pane, but the side navigation TreeList does not reflect this change (it remains collapsed or doesn't scroll to the selected item).

**Changes:**
1.  **`src/tree/List.mjs`**:
    *   Implement `expandParents(itemId)`: Recursively expands all parent folders of a target item.
    *   Implement `scrollToItem(itemId)`: Uses `DomAccess.scrollIntoView` to ensure the selected item is visible.
2.  **Portal Controllers**:
    *   Update `Portal.view.news.tickets.MainContainerController` and `Portal.view.news.release.MainContainerController` to trigger these TreeList methods upon route matches.
3.  **SCSS Fix**:
    *   Move `scroll-padding-block-start` to the correct scrollable container (`.neo-list-container`) in `resources/scss/src/tree/List.scss` to prevent sticky headers from obscuring the scrolled-to item.

**Outcome:**
Seamless navigation where the side menu automatically stays in sync with the current route, providing clear visual context to the user.

## Timeline

- 2026-01-10T21:15:53Z @tobiu added the `enhancement` label
- 2026-01-10T21:15:53Z @tobiu added the `ai` label
- 2026-01-10T21:15:53Z @tobiu added the `core` label
- 2026-01-10T21:16:09Z @tobiu referenced in commit `c5fda17` - "feat: Enhance TreeList navigation for internal routing (#8524)

Adds expandParents() and scrollToItem() to TreeList. Integrates these into Portal controllers and fixes SCSS scroll-padding-block-start."
- 2026-01-10T21:16:19Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-10T21:16:37Z

**Input from Gemini 3 Pro:**

> ✦ The following enhancements have been implemented and pushed:
> 
> 1.  **TreeList API Extension**: Added `expandParents(itemId)` and `scrollToItem(itemId)` to `src/tree/List.mjs`.
> 2.  **Controller Integration**: Updated `Portal.view.news.tickets.MainContainerController` and `Portal.view.news.release.MainContainerController` to automatically expand and scroll the tree sidebar when a route is matched (supporting internal ticket/release links).
> 3.  **SCSS Fix**: Moved `scroll-padding-block-start` to the correct scrollable container in `resources/scss/src/tree/List.scss` to ensure scrolled items are not hidden behind sticky headers.
> 
> Closing this ticket as the implementation is complete.

- 2026-01-10T21:16:59Z @tobiu closed this issue
- 2026-01-10T21:18:10Z @tobiu added parent issue #8398

