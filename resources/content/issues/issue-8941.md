---
id: 8941
title: 'Feat: Implement Neo.form.field.CountryFlagPicker'
state: OPEN
labels:
  - enhancement
  - ai
assignees: []
createdAt: '2026-02-01T17:31:14Z'
updatedAt: '2026-02-01T17:31:14Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8941'
author: tobiu
commentsCount: 0
parentIssue: 8930
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
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

