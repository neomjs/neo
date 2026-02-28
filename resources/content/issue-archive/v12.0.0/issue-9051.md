---
id: 9051
title: 'Enhancement: Polish Country Field & Inline Label Support'
state: CLOSED
labels:
  - bug
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-08T17:08:45Z'
updatedAt: '2026-02-08T17:10:13Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9051'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-08T17:10:13Z'
---
# Enhancement: Polish Country Field & Inline Label Support

This ticket covers several enhancements and fixes related to the Country field and general inline label support.

**Changes:**
1.  **`Neo.form.field.Country`**:
    *   Implement robust flag icon injection via `afterSetTriggers` override to persist through VDOM restructuring.
    *   Add `baseCls` `neo-countryfield` for targeted styling.
    *   Refactor `updateFlag` logic to handle visibility and value changes correctly.
    *   Remove `pickerWidth` from class definition (instance-level config).
2.  **`Neo.form.field.Text`**:
    *   Fix `afterSetInputValue` to correctly update `centerBorderElWidth` when `labelPosition: 'inline'` and content state changes programmatically. This prevents the border from striking through the floating label.
3.  **Styling**:
    *   **`resources/scss/src/form/field/Country.scss`**: Add styles for `text-transform: capitalize` on inputs and reduce `padding-left` for inline label mode to fit the flag icon better.
    *   **`resources/scss/src/list/Country.scss`**: Add `overflow-x: hidden` to prevent layout thrashing and horizontal scrollbars caused by content width calculations.
4.  **DevRank Integration**:
    *   Update `ControlsContainer.mjs` to use the refined Country field configuration.

**Goal:** Ensure a polished, bug-free experience for the Country field in inline label mode within the DevRank application.

## Timeline

- 2026-02-08T17:08:47Z @tobiu added the `bug` label
- 2026-02-08T17:08:47Z @tobiu added the `enhancement` label
- 2026-02-08T17:08:47Z @tobiu added the `ai` label
- 2026-02-08T17:09:30Z @tobiu referenced in commit `ee20221` - "feat: Polish Country Field & Inline Label Support (#9051)"
### @tobiu - 2026-02-08T17:09:41Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the enhancements and fixes described in the ticket.
> 
> **Commit:** `feat: Polish Country Field & Inline Label Support (#9051)` (ee20221c2)
> 
> **Key Updates:**
> -   **`Country.mjs`**: Refactored to use `afterSetTriggers` for robust flag injection, ensuring persistence across VDOM updates. Removed `pickerWidth` from class.
> -   **`Text.mjs`**: Fixed `afterSetInputValue` to correctly update the `centerBorderElWidth` when using `labelPosition: 'inline'`, resolving the "strikethrough" visual bug on programmatic value changes.
> -   **SCSS**: Added `resources/scss/src/form/field/Country.scss` for input styling (padding, capitalization) and updated `list/Country.scss` with `overflow-x: hidden`.
> -   **DevRank**: Updated `ControlsContainer.mjs` configuration.
> 
> The Country field now works seamlessly with inline labels and programmatic updates.

- 2026-02-08T17:09:52Z @tobiu assigned to @tobiu
- 2026-02-08T17:10:13Z @tobiu closed this issue

