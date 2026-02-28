---
id: 9111
title: Support ISO 2 country codes in CountryFlag component and grid column
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-12T09:12:49Z'
updatedAt: '2026-02-12T10:41:50Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9111'
author: tobiu
commentsCount: 1
parentIssue: 9106
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-12T10:41:50Z'
---
# Support ISO 2 country codes in CountryFlag component and grid column

Support ISO 2 country codes in CountryFlag component and grid column.

1.  **`src/component/CountryFlag.mjs`**:
    -   Add `countryCode_` reactive config.
    -   Update `afterSetLocation` logic to prioritize `countryCode` for flag URL generation if available.
    -   Use `location` for the text label.

2.  **`src/grid/column/CountryFlag.mjs`**:
    -   Add `contentField` config (defaulting to 'location').
    -   Update `applyRecordConfigs` to map `countryCode` from the record if available.

3.  **`apps/devindex/view/home/GridContainer.mjs`**:
    -   Change the `dataField` for the 'Location' column from `'location'` to `'country_code'`.
    -   Set `sortable: false` for this column.

## Timeline

- 2026-02-12T09:12:50Z @tobiu added the `enhancement` label
- 2026-02-12T09:12:51Z @tobiu added the `ai` label
- 2026-02-12T09:15:28Z @tobiu assigned to @tobiu
- 2026-02-12T09:15:36Z @tobiu added parent issue #9106
- 2026-02-12T10:40:59Z @tobiu referenced in commit `3e60dfb` - "feat: Implement ISO country filtering in DevIndex and fix Store Turbo Mode filtering (#9111)"
### @tobiu - 2026-02-12T10:41:05Z

**Input from Gemini 3 Pro:**

> ✦ Implemented full support for ISO 2 country code filtering and rendering in DevIndex.
> 
> **Framework Enhancements:**
> - **`Neo.data.Store`**: Fixed a critical issue in Turbo Mode (`autoInitRecords: false`) where filtering during streaming (insertion) failed because raw data objects (POJOs) were not hydrated with mapped fields. Overridden `isFilteredItem` to resolve filter properties on the fly.
> - **`Neo.component.CountryFlag`**: Added `countryCode_` and `resolveCountryCode_` configs to support direct ISO code rendering without relying on location string parsing.
> - **`Neo.grid.column.CountryFlag`**: Added `contentField` config to separate the flag source (`dataField`) from the text label source.
> 
> **App Implementation:**
> - **Store**: Switched `Contributors` store to filter by `country_code` using exact match (`===`) instead of loose `location` search.
> - **View**: Updated `GridContainer` to use `country_code` for the Location column. Updated `ControlsContainer` to bind the Country combo to `country_code` and return the ISO code (`valueField: 'code'`).
> - **Logic**: Ensured filter values are uppercased to match ISO standards in the data.
> 
> Verified that both initial loading with URL parameters and manual filtering now work correctly with the streaming grid.

- 2026-02-12T10:41:50Z @tobiu closed this issue

