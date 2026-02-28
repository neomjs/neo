---
id: 8934
title: 'Feat: DevRank Grid Expansion'
state: CLOSED
labels:
  - enhancement
  - design
assignees:
  - tobiu
createdAt: '2026-02-01T15:38:50Z'
updatedAt: '2026-02-01T15:55:44Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8934'
author: tobiu
commentsCount: 1
parentIssue: 8930
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-01T15:55:44Z'
---
# Feat: DevRank Grid Expansion

This task focuses on updating the DevRank UI to display the enriched data fetched by the discovery engine.

### Requirements
1.  **Update Model:** Modify `DevRank.model.Contributor` to include `location`, `company`, `bio`, and `followers`.
2.  **Grid Columns:**
    - **User:** Enhance renderer to include Avatar + Login (Link to GitHub Profile).
    - **Name:** Add a column for the full name.
    - **Location:** Add a column for location.
    - **Company:** Add a column for company.
    - **Followers:** Add a column for follower count.
3.  **Sparklines (Optional/Stretch):** If feasible, use the `years` data to render a small activity graph in a column.

### Acceptance Criteria
- The grid displays the new columns populated with data from `resources/data.json`.
- Clicking the username opens the GitHub profile.


## Timeline

- 2026-02-01T15:38:51Z @tobiu added the `enhancement` label
- 2026-02-01T15:38:51Z @tobiu added the `design` label
- 2026-02-01T15:38:58Z @tobiu added parent issue #8930
- 2026-02-01T15:39:09Z @tobiu assigned to @tobiu
- 2026-02-01T15:49:24Z @tobiu cross-referenced by #8933
- 2026-02-01T15:54:58Z @tobiu referenced in commit `8404b70` - "feat: DevRank Grid Expansion (#8934)"
### @tobiu - 2026-02-01T15:55:11Z

**Input from Gemini 3 Pro:**

> ✦ I have successfully updated the DevRank frontend to visualize the enriched contributor data.
> 
> ### Changes Implemented
> 1.  **Model Update:** Updated `DevRank.model.Contributor` to include `location`, `company`, `bio`, and `followers`.
> 2.  **Grid Expansion:**
>     - **User Column:** Enhanced to show a 32px circular avatar, the login (linked to GitHub), and the user's full name if available.
>     - **New Columns:** Added `Followers`, `Company`, and `Location` columns.
>     - **Formatting:** Applied number formatting to `Contributions` and `Followers`. Cleaned up company names (removing '@'). Formatted the `Last Active` date.
>     - **Layout:** Adjusted column widths and alignment for better readability.
> 
> The Grid is now fully synced with the backend data structure. I will now close this ticket.

- 2026-02-01T15:55:45Z @tobiu closed this issue

