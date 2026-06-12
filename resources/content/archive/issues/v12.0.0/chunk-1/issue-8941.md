---
id: 8941
title: 'Feat: Implement Neo.form.field.CountryFlagPicker'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-01T17:31:14Z'
updatedAt: '2026-02-08T15:53:58Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8941'
author: tobiu
commentsCount: 1
parentIssue: 8930
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-08T15:53:58Z'
---
# Feat: Implement Neo.form.field.CountryFlagPicker

Implement a specialized form field for selecting countries with visual flag indicators, following the pattern of `Neo.form.field.Color`.

**Requirements:**
1.  **Base Class:** Extend `Neo.form.field.Country` (or ComboBox).
2.  **Input Display:** Show the selected country's flag as a circular icon inside the input field (similar to the color indicator).
3.  **List Items:** Render the flag icon next to the country name in the dropdown list.
4.  **Utility:** Leverage the new `src/util/CountryFlags.mjs` for mapping names/codes to icon paths.
5.  **Icons:** Use the 'circle-flags' library (SVG) for the visual assets.

**Acceptance Criteria:**
- [ ] Users can see the flag of the selected country in the input.
- [ ] Users see flags in the picker dropdown.
- [ ] Fallback to a default icon (e.g., globe) if no flag is found.

## Timeline

- 2026-02-01T17:31:15Z @tobiu added the `enhancement` label
- 2026-02-01T17:31:15Z @tobiu added the `ai` label
- 2026-02-01T17:31:28Z @tobiu added parent issue #8930
- 2026-02-08T15:38:11Z @tobiu referenced in commit `c901142` - "feat: Enhance Neo.form.field.Country with flags and DevRank integration (#8941)"
### @tobiu - 2026-02-08T15:53:32Z

**Input from Gemini 3 Pro:**

> ✦ I have enhanced the existing `Neo.form.field.Country` class instead of creating a new `CountryFlagPicker` widget.
> 
> **Changes:**
> 1.  **`src/form/field/Country.mjs`**:
>     *   Added a default `store` configuration in `static config` that uses `CountryFlags.countries`.
>     *   Set `valueField` to `'name'` to match the store.
>     *   Enhanced `afterSetValue` to properly handle flag updates and support record objects.
>     *   Added `pickerWidth` and adjusted styling.
> 2.  **`src/list/Country.mjs`**:
>     *   Added `baseCls` and moved inline styles to SCSS.
>     *   Updated `createItemContent` to display country flags inline with the text.
> 3.  **`resources/scss/src/list/Country.scss`**:
>     *   Added styles for the country list items (flags and text capitalization).
> 4.  **`apps/devrank/view/ControlsContainer.mjs`**:
>     *   Integrated `Neo.form.field.Country` into the DevRank controls panel.
> 
> This approach avoids code duplication and leverages the existing class infrastructure. Use `showFlags: true` to enable the flag icons.

- 2026-02-08T15:53:35Z @tobiu assigned to @tobiu
- 2026-02-08T15:53:58Z @tobiu closed this issue

