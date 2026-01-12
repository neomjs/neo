---
id: 8504
title: Create Portal.store.Tickets
state: CLOSED
labels:
  - enhancement
  - ai
  - core
assignees:
  - tobiu
createdAt: '2026-01-10T15:00:16Z'
updatedAt: '2026-01-10T15:02:06Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8504'
author: tobiu
commentsCount: 1
parentIssue: 8398
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-10T15:02:06Z'
---
# Create Portal.store.Tickets

Create a new store `apps/portal/store/Tickets.mjs` extending `Neo.data.Store`.

**Requirements:**
1.  **Model:** Use `Portal.model.Ticket`.
2.  **URL:** `../../apps/portal/resources/data/tickets.json`.
3.  **Cleanup:** Remove `keyProperty: 'id'` from `apps/portal/store/Releases.mjs` as it is the default.
4.  **Pattern:** Follow the established pattern (minus the redundant keyProperty).

This store will power the Tickets TreeList in the Portal.

## Timeline

- 2026-01-10T15:00:17Z @tobiu added the `enhancement` label
- 2026-01-10T15:00:17Z @tobiu added the `ai` label
- 2026-01-10T15:00:17Z @tobiu added the `core` label
- 2026-01-10T15:00:26Z @tobiu added parent issue #8398
- 2026-01-10T15:01:29Z @tobiu referenced in commit `af5271b` - "feat: Create Portal.store.Tickets and cleanup Releases Store (#8504)"
### @tobiu - 2026-01-10T15:01:37Z

**Input from Gemini 3 Pro:**

> ✦ I have created the `Portal.store.Tickets` class and cleaned up `Portal.store.Releases`.
> 
> **Changes:**
> 1.  **Created `apps/portal/store/Tickets.mjs`:**
>     -   Extends `Neo.data.Store`.
>     -   Uses `Portal.model.Ticket`.
>     -   Loads data from `tickets.json`.
> 2.  **Updated `apps/portal/store/Releases.mjs`:**
>     -   Removed redundant `keyProperty: 'id'` config.
> 
> Code committed and pushed to `dev`.
> 

- 2026-01-10T15:01:45Z @tobiu assigned to @tobiu
- 2026-01-10T15:02:06Z @tobiu closed this issue

