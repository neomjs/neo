---
id: 8110
title: Add Commit History Grid to Legit App
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-12-13T16:34:32Z'
updatedAt: '2025-12-13T17:01:32Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8110'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-13T17:01:32Z'
---
# Add Commit History Grid to Legit App

To visualize the git history in the Legit app, we will:
1.  **Create Model & Store:**
    -   `apps/legit/model/Commit.mjs`
    -   `apps/legit/store/Commits.mjs`
2.  **Update State Provider:**
    -   Add `commitStore` to `apps/legit/view/ViewportStateProvider.mjs`.
3.  **Update Service:**
    -   Add `loadHistory(branch)` to `apps/legit/service/Legit.mjs` to fetch parsed commit logs.
4.  **Update View:**
    -   Add a `Neo.grid.Container` to `apps/legit/view/Viewport.mjs` (below the LivePreview).
    -   Bind it to the `commitStore`.
5.  **Update Controller:**
    -   In `apps/legit/view/ViewportController.mjs`, fetch history updates during the polling loop.


## Timeline

- 2025-12-13T16:34:34Z @tobiu added the `enhancement` label
- 2025-12-13T16:34:34Z @tobiu added the `ai` label
- 2025-12-13T16:59:03Z @tobiu assigned to @tobiu
- 2025-12-13T16:59:39Z @tobiu referenced in commit `9a693ef` - "Add Commit History Grid to Legit App #8110"
### @tobiu - 2025-12-13T17:00:50Z

<img width="1271" height="1622" alt="Image" src="https://github.com/user-attachments/assets/6654d6e4-d6e5-4b2d-9cd7-d5605105b3da" />

### @tobiu - 2025-12-13T17:01:24Z

**Input from Neo Agent:**

> ◆ I have successfully implemented the Commit History Grid and integrated it into the Legit app.
> 
> **Implementation Details:**
> 
> 1.  **Data Layer:**
>     -   Created `apps/legit/model/Commit.mjs` to define the commit data structure.
>     -   Created `apps/legit/store/Commits.mjs` to manage the commit history.
>     -   Registered the new store in `apps/legit/view/ViewportStateProvider.mjs`.
> 
> 2.  **Service Integration:**
>     -   Updated `apps/legit/service/Legit.mjs` with a `loadHistory(branch)` method that reads and parses the git history from the virtual file system.
> 
> 3.  **UI Components:**
>     -   Created `apps/legit/view/CommitGrid.mjs` as a dedicated grid component for displaying commits.
>     -   Updated `apps/legit/view/Viewport.mjs` to include the grid below the live preview area, wrapped in a Panel with a splitter for resizing.
> 
> 4.  **Controller Logic:**
>     -   Updated `apps/legit/view/ViewportController.mjs` to:
>         -   Fetch and reload commit history in the polling loop (`poll()`) whenever the branch head changes.
>         -   Add a renderer (`onCommitColumnRenderer`) to format timestamps and author names in the grid.
> 
> The feature is now complete and ready for review.

- 2025-12-13T17:01:32Z @tobiu closed this issue

