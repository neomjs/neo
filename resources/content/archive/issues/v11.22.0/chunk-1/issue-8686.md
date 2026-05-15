---
id: 8686
title: Update Ticket View Default Route to First Release Item
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-15T12:26:25Z'
updatedAt: '2026-01-15T12:32:02Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8686'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-15T12:32:02Z'
---
# Update Ticket View Default Route to First Release Item

**Goal:** Change the default routing behavior in `Portal.view.news.tickets.MainContainerController`.

**Current Behavior:**
`onRouteDefault` selects the item at index 1, which corresponds to the first item in the "Backlog" folder.

**Desired Behavior:**
Select the first item inside the *first release* folder.
The logic should be:
1.  Iterate through the store records.
2.  Identify the second record that has `parentId: null` (this assumes the order is [Backlog, Release 1, Release 2...]).
3.  Select the record immediately following this second root node.

**Task:**
- Update `onRouteDefault` in `apps/portal/view/news/tickets/MainContainerController.mjs`.
- Ensure the logic handles store loading state correctly.

## Timeline

- 2026-01-15T12:26:26Z @tobiu added the `enhancement` label
- 2026-01-15T12:26:26Z @tobiu added the `ai` label
- 2026-01-15T12:30:59Z @tobiu referenced in commit `d26d4c6` - "enhancement: Update Ticket View default route to first release item (#8686)"
- 2026-01-15T12:31:28Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-15T12:31:41Z

**Input from Gemini 3 Pro:**

> ✦ I have updated `apps/portal/view/news/tickets/MainContainerController.mjs` to implement the new default routing logic.
> 
> **Changes:**
> 1.  Introduced `getDefaultRouteId()` helper method.
> 2.  The method iterates the tree store to find the second root node (which corresponds to the first Release folder, as "Backlog" is the first root).
> 3.  It returns the ID of the record immediately following this second root node (i.e., the first ticket in that release).
> 4.  Updated `onRouteDefault` to use this helper for both immediate navigation and the store load listener.
> 
> This ensures that when users land on the Tickets view without a specific ID, they are taken to the most relevant recent content (the latest release) rather than the Backlog.

- 2026-01-15T12:32:03Z @tobiu closed this issue

