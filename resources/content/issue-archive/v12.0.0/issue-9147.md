---
id: 9147
title: 'Refactor Contributor Model: CamelCase & New Schema Sync'
state: CLOSED
labels:
  - enhancement
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2026-02-13T14:47:02Z'
updatedAt: '2026-02-13T14:55:12Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9147'
author: tobiu
commentsCount: 1
parentIssue: 9106
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-13T14:55:12Z'
---
# Refactor Contributor Model: CamelCase & New Schema Sync

Refactor the `DevIndex.model.Contributor` class to adhere to Neo.mjs coding conventions (camelCase) and synchronize with the latest backend schema changes.

**Objective:**
Eliminate snake_case fields (technical debt) and expose new data points (heuristics, metadata) to the frontend.

**Changes:**
1.  **Rename Fields:**
    -   `total_contributions` -> `totalContributions`
    -   `country_code` -> `countryCode`
    -   `first_year` -> `firstYear`
    -   `last_updated` -> `lastUpdated`
    -   `linkedin_url` -> `linkedinUrl`
    -   `total_commits` -> `totalCommits`

2.  **Add New Fields:**
    -   `heuristics` (mapping: `hm`, type: `Object`, default: `null`)
    -   `isHireable` (mapping: `h`, type: `Boolean`, default: `false`)
    -   `hasSponsors` (mapping: `s`, type: `Boolean`, default: `false`)
    -   `topRepo` (mapping: `tr`, type: `Array`, default: `null`)
    -   `privateContributions` (mapping: `py`, type: `Array`, default: `[]`)
    -   `twitter` (mapping: `t`, type: `String`, default: `null`)
    -   `website` (mapping: `w`, type: `String`, default: `null`)

3.  **Update References:**
    -   `apps/devindex/view/home/GridContainer.mjs` (sorters, renderers)
    -   `apps/devindex/view/home/ControlsContainer.mjs` (filters)
    -   `apps/devindex/store/Contributors.mjs` (sorters)
    -   `apps/devindex/services/LocationNormalizer.mjs` (if referenced)

**Safety:**
Ensure all new fields handle `undefined` values gracefully to support the rolling update of `users.jsonl`.


## Timeline

- 2026-02-13T14:47:04Z @tobiu added the `enhancement` label
- 2026-02-13T14:47:04Z @tobiu added the `ai` label
- 2026-02-13T14:47:04Z @tobiu added the `refactoring` label
- 2026-02-13T14:47:15Z @tobiu added parent issue #9106
- 2026-02-13T14:54:20Z @tobiu referenced in commit `92254f2` - "refactor(devindex): CamelCase Model & Schema Sync (#9147)

- Refactored Contributor model to use camelCase field names (totalContributions, countryCode, etc.)
- Added new fields: heuristics, isHireable, hasSponsors, topRepo, privateContributions
- Updated GridContainer and ControlsContainer to match new field names
- Cleaned up technical debt (snake_case removal)"
### @tobiu - 2026-02-13T14:54:49Z

**Input from Gemini 3 Pro:**

> ✦ Refactored `DevIndex.model.Contributor` and associated Views to use camelCase and sync with the new backend schema.
> 
> **Changes:**
> 1.  **Model (`Contributor.mjs`):**
>     -   Renamed `total_contributions` -> `totalContributions`
>     -   Renamed `country_code` -> `countryCode`
>     -   Renamed `first_year` -> `firstYear`
>     -   Renamed `last_updated` -> `lastUpdated`
>     -   Renamed `linkedin_url` -> `linkedinUrl`
>     -   Renamed `commits_array` -> `commitsArray`
>     -   Renamed `total_commits` -> `totalCommits`
>     -   Added `heuristics` (`hm`), `isHireable` (`h`), `hasSponsors` (`s`), `topRepo` (`tr`), `privateContributions` (`py`), `twitter` (`t`), `website` (`w`).
> 
> 2.  **Store (`Contributors.mjs`):**
>     -   Updated sorters and filters to use new camelCase names.
> 
> 3.  **Views (`GridContainer.mjs`, `ControlsContainer.mjs`):**
>     -   Updated column `dataField` references.
>     -   Updated filter `name` references.
>     -   Updated `onSortColumn` interception logic.
> 
> **Verification:**
> -   `Country` filter logic in `ControlsContainer` updated (`name: 'countryCode'`).
> -   Grid column renderers updated to access new field names.
> 
> This modernizes the frontend codebase and prepares it to display the new AI/Heuristics data.

- 2026-02-13T14:54:59Z @tobiu assigned to @tobiu
- 2026-02-13T14:55:12Z @tobiu closed this issue

