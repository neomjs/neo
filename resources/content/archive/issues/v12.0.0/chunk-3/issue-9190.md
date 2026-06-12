---
id: 9190
title: 'DevIndex: Add ''Private %'' Column'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-17T03:44:33Z'
updatedAt: '2026-02-17T03:59:04Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9190'
author: tobiu
commentsCount: 1
parentIssue: 9106
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-17T03:59:04Z'
---
# DevIndex: Add 'Private %' Column

To better understand the contribution distribution, we need a new column that shows the ratio of private contributions (`py`) to total contributions (`tc`).

**Formula:** `(totalPrivateContributions / totalContributions) * 100`

**Proposed Implementation:**
1.  Add `totalPrivateContributions` calculated field to `DevIndex.model.Contributor`.
2.  Add `privateContributionsRatio` calculated field.
3.  Add 'Private %' column to `DevIndex.view.home.GridContainer`, positioned after 'Total'.


## Timeline

- 2026-02-17T03:44:34Z @tobiu added the `enhancement` label
- 2026-02-17T03:44:34Z @tobiu added the `ai` label
- 2026-02-17T03:57:43Z @tobiu referenced in commit `a9ccf7e` - "feat: Add Private % column to DevIndex grid (#9190)"
- 2026-02-17T03:57:53Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-17T03:58:10Z

**Input from Gemini 3 Pro:**

> ✦ Implemented the 'Private %' column in the DevIndex grid.
> 1.  **Model Update**: Added `totalPrivateContributions` and `privateContributionsRatio` calculated fields to `DevIndex.model.Contributor`. The logic supports both Record instances and raw data (Soft Hydration) for performance.
> 2.  **Grid Update**: Added the column to `DevIndex.view.home.GridContainer`.
>     *   **Position**: After 'Total'.
>     *   **Renderer**: Displays values with 2 decimal places. Zeros and nulls are rendered as empty strings to reduce visual clutter.
>     *   **Width**: Set to `90` for both 'Private %' and 'Commits %' to optimize horizontal space.
> 

- 2026-02-17T03:58:51Z @tobiu added parent issue #9106
- 2026-02-17T03:59:04Z @tobiu closed this issue

