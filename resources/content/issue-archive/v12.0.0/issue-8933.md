---
id: 8933
title: 'Feat: Discovery Engine Data Enrichment'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-01T15:38:33Z'
updatedAt: '2026-02-01T15:50:58Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8933'
author: tobiu
commentsCount: 1
parentIssue: 8930
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-01T15:50:58Z'
---
# Feat: Discovery Engine Data Enrichment

This task focuses on upgrading the `gh_discovery.mjs` service to fetch richer profile data for each contributor. This is the prerequisite for advanced filtering in the UI.

### Requirements
1.  **Update GraphQL Query:** Modify the initial user fetch in `gh_discovery.mjs` to include:
    - `location`
    - `company`
    - `bio`
    - `followers` { totalCount }
2.  **Schema Update:** Ensure the output JSON `resources/data.json` includes these new fields.
3.  **Data Structure:** Ensure `years` (contributions by year) is persisted in a structured format suitable for frontend consumption (e.g., sparklines).
4.  **Execution:** Run the script to regenerate `resources/data.json` with the enriched data for the existing candidates.

### Acceptance Criteria
- `resources/data.json` contains `location`, `company`, `bio`, and `followers` for each user.
- The script runs without errors.


## Timeline

- 2026-02-01T15:38:34Z @tobiu added the `enhancement` label
- 2026-02-01T15:38:35Z @tobiu added the `ai` label
- 2026-02-01T15:38:42Z @tobiu added parent issue #8930
- 2026-02-01T15:39:05Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-01T15:49:23Z

**Input from Gemini 3 Pro:**

> ✦ I have successfully implemented the Data Enrichment feature.
> 
> ### Completed Actions
> 1.  **Updated `gh_discovery.mjs`:**
>     - Refactored the GraphQL query to fetch `location`, `company`, `bio`, and `followers.totalCount`.
>     - Updated the user processing logic to store these new fields in the result object.
>     - Updated the "One-Shot" deep scan loop to use template literals correctly (fixing a syntax error).
>     - Added logic to load existing data and attempt to enrich it, ensuring we don't lose the seed candidates while expanding the list.
>     - Increased the processing limit to 100 to capture more candidates from the expanded repo list.
> 
> 2.  **Data Generation:**
>     - Ran the script successfully.
>     - Processed 93 candidates (including `tobiu`, `yyx990803`, `sindresorhus`, etc.).
>     - Generated a new `apps/devrank/resources/data.json` containing 87 valid, enriched user profiles.
> 
> ### Data Validation
> The new JSON now contains the following schema for each user:
> ```json
> {
>   "login": "tobiu",
>   "name": "Tobias Uhlig",
>   "avatar_url": "...",
>   "location": "Germany",
>   "company": "Neo.mjs",
>   "bio": "Creator of Neo.mjs ...",
>   "followers": 123,
>   "total_contributions": 29523,
>   "years": { ... },
>   "first_year": 2011,
>   "last_updated": "2026-02-01T..."
> }
> ```
> 
> The backend part of the enrichment is complete. I will now close this ticket and proceed to the frontend implementation (Ticket #8934).

- 2026-02-01T15:50:31Z @tobiu referenced in commit `5bad0ed` - "feat: Discovery Engine Data Enrichment (#8933)"
- 2026-02-01T15:50:58Z @tobiu closed this issue

