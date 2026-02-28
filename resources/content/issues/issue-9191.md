---
id: 9191
title: 'DevIndex: Implement 4-Mode Data Toggle (Total, Public, Private, Commits)'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-17T04:12:18Z'
updatedAt: '2026-02-17T04:41:21Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9191'
author: tobiu
commentsCount: 1
parentIssue: 9106
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-17T04:41:21Z'
---
# DevIndex: Implement 4-Mode Data Toggle (Total, Public, Private, Commits)

We are currently using a "Commits Only" checkbox to switch between Total Contributions and Total Commits. To provide deeper insights, we want to expand this to a "Data Mode" concept with 4 mutually exclusive views:

1.  **Total** (Default): Shows Total Contributions.
2.  **Public**: Shows Public Contributions (Calculated: `Total - Private`).
3.  **Private**: Shows Private Contributions.
4.  **Commits**: Shows Total Commits.

**Tasks:**
1.  **Model (`Contributor.mjs`):** Add `totalPublicContributions` calculated field.
2.  **View (`ControlsContainer.mjs`):** Replace "Commits Only" checkbox with a Radio Group for the 4 modes.
3.  **Grid (`GridContainer.mjs`):**
    -   Replace `commitsOnly` config with `dataMode` (String enum).
    -   Update `afterSetDataMode` to switch columns (`totalContributions`, `totalPublicContributions`, `totalPrivateContributions`, `totalCommits`) and update the active sorter.
    -   Update `activity` sparkline logic to use the correct data source (Public = `y - py`, Private = `py`).
4.  **Toolbar (`StatusToolbar.mjs`):** Update summary labels based on the selected mode.


## Timeline

- 2026-02-17T04:12:18Z @tobiu added the `enhancement` label
- 2026-02-17T04:12:19Z @tobiu added the `ai` label
- 2026-02-17T04:12:40Z @tobiu added parent issue #9106
- 2026-02-17T04:40:31Z @tobiu referenced in commit `a8e64a1` - "feat: Implement 4-Mode Data Toggle (Total, Public, Private, Commits) (#9191)"
- 2026-02-17T04:40:40Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-17T04:40:53Z

**Input from Gemini 3 Pro:**

> ✦ Implemented the 4-Mode Data Toggle ('Total', 'Public', 'Private', 'Commits').
> 
> **Changes:**
> 1.  **Model (`DevIndex.model.Contributor`):**
>     *   Added `totalPublicContributions` calculated field (`Total - Private`).
>     *   Updated `addYearFields` to generate `py{year}` (Private) and `puy{year}` (Public, calculated) virtual fields. These use the same optimized, prototype-based getter strategy as `y` and `cy` to support Grid sorting without memory overhead.
>     *   Enhanced class documentation to explain the `RecordFactory` optimization.
> 
> 2.  **Controls (`DevIndex.view.home.ControlsContainer`):**
>     *   Replaced the "Commits Only" checkbox with a Radio Group (`name: 'dataMode'`) offering the 4 mutually exclusive modes.
> 
> 3.  **Grid (`DevIndex.view.home.GridContainer`):**
>     *   Replaced `commitsOnly` config with `dataMode` (default: 'total').
>     *   Updated `afterSetDataMode` to:
>         *   Switch column data fields (`totalContributions` -> `totalCommits` -> `totalPrivateContributions` -> `totalPublicContributions`).
>         *   Update the active sorter to match the new mode.
>         *   Update `activity` sparkline logic to pull from the correct source arrays (`y`, `cy`, `py`, or `y-py`).
>         *   Update Year columns to use the correct prefix (`y`, `cy`, `py`). **Note:** Public Year sorting uses `y` (Total) as a proxy for now, as dynamic per-year sorting would require additional model complexity.
> 
> 4.  **Toolbar (`DevIndex.view.home.StatusToolbar`):**
>     *   Updated `updateLabels` to calculate and display the correct total based on the selected `dataMode`.
> 

- 2026-02-17T04:41:21Z @tobiu closed this issue
- 2026-02-17T04:50:59Z @tobiu referenced in commit `4e1e105` - "feat: Add Data Mode label to ControlsContainer (#9191)"
- 2026-02-17T04:54:41Z @tobiu referenced in commit `13f846f` - "feat: Add Filters label to ControlsContainer (#9191)"

