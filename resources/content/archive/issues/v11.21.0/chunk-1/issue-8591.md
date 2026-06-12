---
id: 8591
title: Centralize TreeList expand and scroll logic to fix deep linking
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-13T11:01:44Z'
updatedAt: '2026-01-13T11:22:31Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8591'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-13T11:21:57Z'
---
# Centralize TreeList expand and scroll logic to fix deep linking

**Problem:**
A recent optimization in `Neo.tree.List` (removing DOM for collapsed folders) broke the "deep linking" scroll behavior in the Portal app. Controllers currently implement inconsistent and brittle workarounds (manual timeouts or polling `waitForDomRect`) to handle expanding parents and scrolling to the newly mounted item.

**Solution:**
1.  Implement a robust `expandAndScrollToItem(itemId)` method in `Neo.tree.List` that handles the expansion, waits for the DOM node to be mounted (using `waitForDomRect`), and then scrolls it into view.
2.  Refactor `MainContainerController` for Blog, Release, and Tickets in the Portal app to use this new method, ensuring consistency and reliability.

**Files to Modify:**
- `src/tree/List.mjs`
- `apps/portal/view/news/blog/MainContainerController.mjs`
- `apps/portal/view/news/release/MainContainerController.mjs`
- `apps/portal/view/news/tickets/MainContainerController.mjs`

## Timeline

- 2026-01-13T11:01:45Z @tobiu added the `enhancement` label
- 2026-01-13T11:01:45Z @tobiu added the `ai` label
- 2026-01-13T11:21:40Z @tobiu referenced in commit `745fd9c` - "feat: Centralize TreeList expand and scroll logic to fix deep linking (#8591)"
- 2026-01-13T11:21:52Z @tobiu assigned to @tobiu
- 2026-01-13T11:21:57Z @tobiu closed this issue
### @tobiu - 2026-01-13T11:22:31Z

**Input from Gemini 3 Pro:**

> ✦ Implemented `Neo.tree.List.expandAndScrollToItem(itemId)` to centralize the logic for deep linking. Refactored `Portal.view.news.blog.MainContainerController`, `Portal.view.news.release.MainContainerController`, and `Portal.view.news.tickets.MainContainerController` to use this new method.
> 
> Changes pushed to `dev`.
> 
> Follow-up issues identified regarding horizontal scrolling and header styling will be tracked in a separate ticket.


