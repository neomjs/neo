---
id: 8506
title: Add Tickets Tab to Portal News Section
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-10T15:37:44Z'
updatedAt: '2026-01-10T15:46:17Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8506'
author: tobiu
commentsCount: 1
parentIssue: 8398
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-10T15:46:17Z'
---
# Add Tickets Tab to Portal News Section

Integrate the new `Tickets` view into `Portal.view.news.TabContainer` and update `Portal.view.news.TabContainerController`.

**Changes:**
1.  **TabContainer:** Add the `Tickets` tab (loading `apps/portal/view/news/tickets/MainContainer.mjs`) between the Blog and Release Notes tabs in `items`.
    *   Header: Icon `fa fa-bug`, Route `/news/tickets`, Text `Tickets`.
2.  **TabContainerController:**
    *   Add routes for `/news/tickets` and `/news/tickets/{*itemId}` mapping to `onTicketsRoute`.
    *   Update `onTicketsRoute` to set `activeIndex = 1`.
    *   Update `onReleasesRoute` to set `activeIndex = 2` (shifted due to insertion).

This is a sub-task of #8398.

## Timeline

- 2026-01-10T15:37:45Z @tobiu added the `enhancement` label
- 2026-01-10T15:37:45Z @tobiu added the `ai` label
- 2026-01-10T15:38:11Z @tobiu added parent issue #8398
- 2026-01-10T15:45:58Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-10T15:46:02Z

**Input from Gemini 3 Pro:**

> ✦ I have integrated the Tickets view into the Portal News section.
> - **TabContainer:** Added the Tickets tab between Blog and Releases, using `fa-clipboard-list` as the icon.
> - **TabContainerController:** Added routing logic for `/news/tickets` and updated the active index for Releases.
> 
> The Tickets section is now accessible via the UI and URL.

- 2026-01-10T15:46:17Z @tobiu closed this issue

