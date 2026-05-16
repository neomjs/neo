---
id: 8939
title: 'Feat: Country Flag Column'
state: CLOSED
labels:
  - enhancement
  - design
assignees:
  - tobiu
createdAt: '2026-02-01T16:44:01Z'
updatedAt: '2026-02-01T17:53:20Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8939'
author: tobiu
commentsCount: 1
parentIssue: 8930
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-01T17:53:20Z'
---
# Feat: Country Flag Column

This task focuses on adding a column to display the contributor's country flag.

### Requirements
1.  **Shared Utility:** Create `src/util/CountryFlags.mjs` to handle fuzzy matching of location strings to country codes/icon paths.
2.  **Icon Library:** Use 'circle-flags' (SVG) for the icons.
3.  **Grid Column:** Implement a column in `DevRank.view.GridContainer` that uses this utility.
4.  **Renderer:** Render the SVG icon.

### Acceptance Criteria
- The grid displays a round flag icon for users with resolvable locations.

## Timeline

- 2026-02-01T16:44:02Z @tobiu added the `enhancement` label
- 2026-02-01T16:44:02Z @tobiu added the `design` label
- 2026-02-01T16:44:12Z @tobiu added parent issue #8930
- 2026-02-01T16:44:51Z @tobiu assigned to @tobiu
- 2026-02-01T17:50:45Z @tobiu referenced in commit `7bfc76c` - "feat: Implement Country Flag Utility & Grid Integration (#8939)"
### @tobiu - 2026-02-01T17:52:58Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the Country Flag enhancements.
> 
> **Changes:**
> 1.  **Shared Utility (`src/util/CountryFlags.mjs`):** Created a new utility class to map country names and location strings to ISO codes and flag URLs (using the 'circle-flags' library).
> 2.  **Country Field Refactor (`src/form/field/Country.mjs`):**
>     *   Added a `showFlags_` config.
>     *   Refactored the icon implementation to use `removeDom` for cleaner DOM manipulation.
>     *   Updated the field to inject the flag icon into the input wrapper.
> 3.  **Country List (`src/list/Country.mjs`):** Created a new list class that renders flag icons next to country names.
> 4.  **Grid Integration (`apps/devrank/view/GridContainer.mjs`):**
>     *   Updated the 'Location' column to use `CountryFlags` for fuzzy matching.
>     *   Added a renderer that shows the flag icon (or a placeholder) next to the location text.
>     *   Removed the duplicate 'Country' column.
> 
> The grid now displays round flag icons for contributors with resolvable locations, and the text aligns correctly even when no flag is found.

- 2026-02-01T17:53:20Z @tobiu closed this issue

