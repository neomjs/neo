---
id: 9064
title: 'Feat: Implement ''Commits Only'' Toggle for DevRank Grid'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-08T23:56:17Z'
updatedAt: '2026-02-09T00:45:43Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9064'
author: tobiu
commentsCount: 1
parentIssue: 8930
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-09T00:45:43Z'
---
# Feat: Implement 'Commits Only' Toggle for DevRank Grid

We need to add a "Commits Only" toggle to the DevRank controls. This involves several updates:

1.  **Data Model (`Contributor.mjs`):**
    -   Store a secondary array for commits (`c` mapping, `commits` field).
    -   Update `total_contributions` and year fields (`y2020`, etc.) to be dynamic based on the active mode (Total vs. Commits).

2.  **UI (`ControlsContainer.mjs`):**
    -   Add a `CheckBox` for "Commits Only".
    -   Implement a handler to switch the grid's data context.

3.  **Grid (`GridContainer.mjs`):**
    -   Ensure columns binding to `yXXXX` fields update correctly when the underlying data logic changes.
    -   Trigger a re-sort if the active sort column is affected (e.g. `total_contributions`).

4.  **Backend (`Updater.mjs`):**
    -   Already updated to fetch `totalCommitContributions`. We need to ensure this data is now persisted in the `users.json` schema (as a separate array or structure).

This ticket focuses on the frontend implementation (1-3) and assumes data is available or will be mocked until the backend fully populates it.

## Timeline

- 2026-02-08T23:56:18Z @tobiu added the `enhancement` label
- 2026-02-08T23:56:18Z @tobiu added the `ai` label
- 2026-02-08T23:56:54Z @tobiu assigned to @tobiu
- 2026-02-08T23:57:21Z @tobiu added parent issue #8930
- 2026-02-09T00:38:40Z @tobiu referenced in commit `1143fbf` - "Feat: Map 'cy' (Commits) array to Contributor Model fields (#9064)"
- 2026-02-09T00:44:06Z @tobiu referenced in commit `f739be8` - "Feat: Implement 'Commits Only' Toggle (UI & Model) (#9064)"
### @tobiu - 2026-02-09T00:45:21Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the "Commits Only" toggle in the DevRank UI.
> 
> **Features:**
> -   **UI:** Added a "Commits Only" checkbox to the Controls panel.
> -   **Grid Logic:** Toggling the checkbox dynamically updates:
>     -   **Year Columns:** Switches between Total (`yXXXX`) and Commits (`cyXXXX`) data.
>     -   **Sparkline:** Updates the chart to show the corresponding dataset.
>     -   **Total Column:** Updates to show `total_commits` (calculated).
>     -   **Sorting:** Automatically switches the active sorter to the corresponding field (e.g., `total_contributions` -> `total_commits`).
> 
> **Model Support:**
> -   Updated `Contributor` model to include `commits_array` (mapped to `cy`) and a calculated `total_commits` field.
> 
> **Note:** A known issue with sorting in Turbo Mode (lazy instantiation) has been identified and tracked in #9066.

- 2026-02-09T00:45:43Z @tobiu closed this issue

