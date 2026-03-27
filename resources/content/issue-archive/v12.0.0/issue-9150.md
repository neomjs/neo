---
id: 9150
title: 'DevIndex: Client-Side "Commits Only" Toggle & Total Commits Implementation'
state: CLOSED
labels:
  - enhancement
  - ai
  - performance
assignees:
  - tobiu
createdAt: '2026-02-14T00:10:31Z'
updatedAt: '2026-02-14T01:48:19Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9150'
author: tobiu
commentsCount: 1
parentIssue: 9106
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-14T01:48:19Z'
---
# DevIndex: Client-Side "Commits Only" Toggle & Total Commits Implementation

Implement "Commits Only" mode entirely on the client side to avoid data bloat, leveraging Store caching and App Worker performance.

### `GridContainer.mjs`
- Modify `afterSetCommitsOnly`:
    - Swap the `dataField` of the Total column between `totalContributions` and `totalCommits` instead of overwriting renderers.
    - This leverages the Store's "Soft Hydration" (via `doSort`) to cache `totalCommits` values on the raw objects upon first access.
    - Propagate `commitsOnly` state to `this.footerToolbar`.

### `StatusToolbar.mjs`
- Add `commitsOnly_` reactive config.
- Update `updateRowsLabels` to compute the "Total Contributions" sum based on the active mode:
    - Default: Sum `tc` (Total Contributions).
    - Commits Only: Sum `cy` (Commits Year Array) using `reduce`.

This ensures zero data payload increase while maintaining high runtime performance.

## Timeline

- 2026-02-14T00:10:32Z @tobiu added the `enhancement` label
- 2026-02-14T00:10:32Z @tobiu added the `ai` label
- 2026-02-14T00:10:32Z @tobiu added the `performance` label
- 2026-02-14T00:10:39Z @tobiu added parent issue #9106
- 2026-02-14T01:38:20Z @tobiu assigned to @tobiu
- 2026-02-14T01:47:34Z @tobiu referenced in commit `5016084` - "feat(devindex): Implement client-side 'Commits Only' mode (#9150)"
### @tobiu - 2026-02-14T01:47:51Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the client-side "Commits Only" mode.
> 
> **Core Enhancements:**
> 1.  **`src/grid/column/Base.mjs`**:
>     -   Made `dataField` reactive to support generic updates (committed previously).
> 2.  **`apps/devindex/view/home/GridContainer.mjs`**:
>     -   Refactored `afterSetCommitsOnly` to use generic `dataField` swapping.
>     -   Extracted regexes to module constants.
>     -   Simplified `onSortColumn` logic using `regexContributionYear`.
> 3.  **`apps/devindex/view/home/StatusToolbar.mjs`**:
>     -   Implemented `updateLabels` with `store.resolveField` fallback for robust, client-side totals.
>     -   Dynamic label text ("Total Commits" vs "Total Contributions").
> 
> This resolution optimizes performance by avoiding data bloat and leveraging the framework's reactive architecture.

- 2026-02-14T01:48:19Z @tobiu closed this issue

