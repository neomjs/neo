---
id: 8685
title: Rename "Latest" to "Backlog" in Portal Ticket Index
state: CLOSED
labels:
  - enhancement
  - ai
  - build
assignees:
  - tobiu
createdAt: '2026-01-15T12:13:06Z'
updatedAt: '2026-01-15T12:23:04Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8685'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-15T12:23:04Z'
---
# Rename "Latest" to "Backlog" in Portal Ticket Index

**Goal:** Rename the top-level folder "Latest" to "Backlog" in the Portal's Ticket TreeList.

**Rationale:**
The "Latest" folder currently contains archived tickets from the repository state. This naming is confusing as users might expect "Latest" to reflect the currently deployed release or the absolute newest work. "Backlog" is a more accurate term for the collection of tickets that are part of the repository's history and potential future work.

**Task:**
- Update `buildScripts/createTicketIndex.mjs` to change the folder name from "Latest" to "Backlog".


## Timeline

- 2026-01-15T12:13:08Z @tobiu added the `enhancement` label
- 2026-01-15T12:13:08Z @tobiu added the `ai` label
- 2026-01-15T12:13:08Z @tobiu added the `build` label
- 2026-01-15T12:22:13Z @tobiu referenced in commit `f9d1e45` - "enhancement: Rename 'Latest' ticket folder to 'Backlog' (#8685)"
- 2026-01-15T12:22:25Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-15T12:22:43Z

**Input from Gemini 3 Pro:**

> ✦ I have renamed the "Latest" folder to "Backlog" in the Portal's Ticket TreeList.
> 
> **Changes:**
> 1.  **Build Script:** Updated `buildScripts/createTicketIndex.mjs` to use "Backlog" as the group key for active tickets.
> 2.  **View Component:** Updated `apps/portal/view/news/tickets/Component.mjs` to correctly handle the "Backlog" ID when determining badge visibility.
> 3.  **Data:** Regenerated `apps/portal/resources/data/tickets.json` to reflect the new structure.
> 
> The top-level folder for active tickets will now appear as "Backlog".

- 2026-01-15T12:23:05Z @tobiu closed this issue

