---
id: 8399
title: Fix Deep Linking Routing in News TabContainer
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-01-07T22:27:49Z'
updatedAt: '2026-01-07T22:49:41Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8399'
author: tobiu
commentsCount: 1
parentIssue: 8362
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-07T22:49:41Z'
---
# Fix Deep Linking Routing in News TabContainer

**Problem:**
When reloading the Portal with a deep link (e.g., `#/news/releases/11.16.0`), the `NewsTabContainer` defaults to `activeIndex: 0` (Blog), causing the application to switch tabs and lose the route context.

**Solution:**
Update `apps/portal/view/news/TabContainer.mjs` to set `activeIndex: null`. This prevents the initial auto-selection, allowing the `MainContainerController` (or relevant routing logic) to set the correct active tab based on the URL hash.

**Verification:**
Reloading `#/news/releases/...` should preserve the Release Notes view.

## Timeline

- 2026-01-07T22:27:51Z @tobiu added the `bug` label
- 2026-01-07T22:27:51Z @tobiu added the `ai` label
- 2026-01-07T22:28:05Z @tobiu assigned to @tobiu
- 2026-01-07T22:28:48Z @tobiu added parent issue #8362
- 2026-01-07T22:49:18Z @tobiu referenced in commit `0c815cd` - "refactor: Decouple Blog badge update using StateProvider (#8399)"
- 2026-01-07T22:49:18Z @tobiu referenced in commit `0c452ef` - "fix: Prevent default tab selection in NewsTabContainer (#8399)"
### @tobiu - 2026-01-07T22:49:22Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the fix for the deep linking routing issue.
> 
> **Changes:**
> 1.  **`NewsTabContainer`:** Set `activeIndex: null` to allow the controller to determine the initial tab based on the route.
> 2.  **`NewsTabContainerController`:** Created a dedicated controller to handle `/news/blog` and `/news/releases` routes.
> 3.  **Refactoring:** Decoupled the `HeaderToolbar` badge update from the `BlogPosts` store using the `ViewportStateProvider`, preventing cross-view dependency crashes.
> 
> **Verification:**
> Reloading `#/news/releases/11.16.0` now correctly maintains the Release Notes tab context.

- 2026-01-07T22:49:41Z @tobiu closed this issue

