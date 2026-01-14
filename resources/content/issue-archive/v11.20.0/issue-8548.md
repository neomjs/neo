---
id: 8548
title: Refactor PageContainer for Tickets View
state: CLOSED
labels:
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2026-01-11T15:15:50Z'
updatedAt: '2026-01-11T15:21:58Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8548'
author: tobiu
commentsCount: 1
parentIssue: 8398
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-11T15:21:58Z'
---
# Refactor PageContainer for Tickets View

To address architectural debt and prevent layout regressions in other views, refactor `apps/portal/view/shared/content/PageContainer.mjs`.

Changes:
1.  Create `apps/portal/view/news/tickets/PageContainer.mjs` extending the shared PageContainer.
2.  Move `layout: null` and `style: {flex: 1, overflowY: 'auto', position: 'relative'}` to the new subclass.
3.  Revert `apps/portal/view/shared/content/PageContainer.mjs` to its default state.
4.  Update `apps/portal/view/shared/content/Container.mjs` to make the `PageContainer` module configurable.
5.  Update `apps/portal/view/news/tickets/MainContainer.mjs` to use the new subclass.

## Timeline

- 2026-01-11T15:15:51Z @tobiu added the `ai` label
- 2026-01-11T15:15:51Z @tobiu added the `refactoring` label
- 2026-01-11T15:20:53Z @tobiu referenced in commit `eb8ffda` - "refactor: Create TicketPageContainer to isolate layout overrides (#8548)"
- 2026-01-11T15:21:24Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-11T15:21:29Z

**Input from Gemini 3 Pro:**

> ✦ Refactoring complete.
> 
> - Created `apps/portal/view/news/tickets/PageContainer.mjs` extending `Portal.view.shared.content.PageContainer`.
> - Moved `layout: null` and `style` configurations to the new subclass.
> - Reverted `apps/portal/view/shared/content/PageContainer.mjs` to its default state.
> - Updated `apps/portal/view/shared/content/Container.mjs` to support a configurable `pageContainerModule`.
> - Updated `apps/portal/view/news/tickets/MainContainer.mjs` to use the new `TicketPageContainer`.
> 
> This isolates the layout changes to the tickets view, preventing regressions in other views like the release view.

- 2026-01-11T15:21:46Z @tobiu added parent issue #8398
- 2026-01-11T15:21:58Z @tobiu closed this issue

