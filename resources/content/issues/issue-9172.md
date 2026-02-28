---
id: 9172
title: 'DevIndex: Optimize LinkedIn URL Storage'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-15T17:14:25Z'
updatedAt: '2026-02-15T17:41:07Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9172'
author: tobiu
commentsCount: 1
parentIssue: 9106
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-15T17:40:31Z'
---
# DevIndex: Optimize LinkedIn URL Storage

The DevIndex Updater currently stores the full LinkedIn URL (e.g., `"https://www.linkedin.com/in/leecalcote/"`) in the `li` field. To reduce file size and optimize data storage, we should only store the LinkedIn username (e.g., `"leecalcote"`).

**Tasks:**
1. Update `fetchUserData` in `apps/devindex/services/Updater.mjs` to extract and store only the username from the LinkedIn URL.
2. Ensure the `IconLink` column renderer in `GridContainer.mjs` reconstructs the full URL.

## Timeline

- 2026-02-15T17:14:27Z @tobiu added the `enhancement` label
- 2026-02-15T17:14:27Z @tobiu added the `ai` label
- 2026-02-15T17:14:43Z @tobiu assigned to @tobiu
- 2026-02-15T17:14:50Z @tobiu added parent issue #9106
- 2026-02-15T17:40:02Z @tobiu referenced in commit `d6474ec` - "feat(devindex): Optimize LinkedIn URL storage and display (#9172)

- Updater.mjs: Extract and store only the LinkedIn username in the 'li' field to reduce data size.
- GridContainer.mjs: Update LinkedIn column to use new 'linkedin' type.
- src/grid/column/LinkedIn.mjs: New column type that handles dynamic URL reconstruction from username.
- src/grid/Container.mjs: Register 'linkedin' column type.
- src/grid/column/_export.mjs: Export new LinkedIn column."
- 2026-02-15T17:40:32Z @tobiu closed this issue
### @tobiu - 2026-02-15T17:41:07Z

**Input from Gemini 3 Pro:**

> ✦ I have optimized the LinkedIn URL storage and implemented a new framework column type for it.
> 
> **Changes:**
> 1.  **Storage Optimization:** `Updater.mjs` now extracts and stores only the LinkedIn username (e.g., `tobiu` instead of `https://www.linkedin.com/in/tobiu/`) in the `li` field. This reduces file size.
> 2.  **New Column Type:** Created `Neo.grid.column.LinkedIn` (`src/grid/column/LinkedIn.mjs`).
>     -   Extends `Neo.grid.column.Component`.
>     -   Automatically reconstructs the full LinkedIn URL from the username.
>     -   Handles legacy data (full URLs) gracefully by checking for `http` prefix.
>     -   Sets the default `iconCls` to `fa-brands fa-linkedin`.
> 3.  **Framework Integration:** Registered the new column type as `linkedin` in `Neo.grid.Container`.
> 4.  **DevIndex Grid:** Updated `GridContainer.mjs` to use the new `type: 'linkedin'` column.


