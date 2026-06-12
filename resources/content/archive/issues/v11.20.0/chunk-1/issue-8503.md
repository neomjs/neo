---
id: 8503
title: Create Portal.model.Ticket
state: CLOSED
labels:
  - enhancement
  - ai
  - core
assignees:
  - tobiu
createdAt: '2026-01-10T14:54:26Z'
updatedAt: '2026-01-10T14:57:27Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8503'
author: tobiu
commentsCount: 1
parentIssue: 8398
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-10T14:57:27Z'
---
# Create Portal.model.Ticket

Create a new data model `apps/portal/model/Ticket.mjs` extending `Neo.data.Model`.

**Requirements:**
1.  **Fields:** `id`, `parentId`, `title`, `path`, `isLeaf` (default `true`), `collapsed` (default `true`).
2.  **Computed Field:** `treeNodeName` for the TreeList display.
    *   **Logic:**
        *   If `isLeaf` is true (it's a ticket): format as `<b>#{id}</b> {title}`.
        *   If `isLeaf` is false (it's a folder/group): just return `{id}` (e.g., "Latest" or "11.19.1").
3.  **Pattern:** Follow the pattern established in `apps/portal/model/Release.mjs`.

This model will be used by the Portal's Ticket Store.

## Timeline

- 2026-01-10T14:54:27Z @tobiu added the `enhancement` label
- 2026-01-10T14:54:27Z @tobiu added the `ai` label
- 2026-01-10T14:54:27Z @tobiu added the `core` label
- 2026-01-10T14:54:39Z @tobiu added parent issue #8398
- 2026-01-10T14:56:36Z @tobiu referenced in commit `15b8813` - "feat: Create Portal.model.Ticket for Ticket TreeList (#8503)"
### @tobiu - 2026-01-10T14:56:54Z

**Input from Gemini 3 Pro:**

> ✦ I have created the `Portal.model.Ticket` class.
> 
> **Features:**
> -   Extends `Neo.data.Model`.
> -   Fields: `id`, `parentId`, `title`, `path`, `isLeaf`, `collapsed`.
> -   Computed Field: `treeNodeName` formats tickets as `<b>#123</b> Title` and folders as `FolderName`.
> 
> Code committed and pushed to `dev`.
> 

- 2026-01-10T14:57:04Z @tobiu assigned to @tobiu
- 2026-01-10T14:57:27Z @tobiu closed this issue

