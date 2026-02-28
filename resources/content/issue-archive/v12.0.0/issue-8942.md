---
id: 8942
title: 'Refactor: DevRank Grid Location Column (VDOM + SCSS)'
state: CLOSED
labels:
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2026-02-01T17:58:48Z'
updatedAt: '2026-02-01T23:55:45Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8942'
author: tobiu
commentsCount: 2
parentIssue: 8930
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-01T18:21:59Z'
---
# Refactor: DevRank Grid Location Column (VDOM + SCSS)

The 'Location' column in the DevRank grid suffers from layout issues when the text is too long, causing the row height to expand.

**Requirements:**
1.  **Refactor Renderer:** Switch the 'Location' column renderer from returning an HTML string to returning a VDOM object.
2.  **CSS Truncation:** Implement text truncation (`text-overflow: ellipsis`, `white-space: nowrap`) to handle long location names gracefully without breaking the row height.
3.  **SCSS Extraction:** Move all inline styles for this column into the SCSS file (`apps/devrank/resources/scss/view/GridContainer.scss` or similar).

**Acceptance Criteria:**
- Long location names are truncated with an ellipsis.
- Grid row heights remain consistent.
- No inline styles in the VDOM renderer.

## Timeline

- 2026-02-01T17:58:49Z @tobiu added the `ai` label
- 2026-02-01T17:58:50Z @tobiu added the `refactoring` label
- 2026-02-01T17:59:01Z @tobiu added parent issue #8930
- 2026-02-01T18:14:44Z @tobiu referenced in commit `62511c5` - "refactor: DevRank Grid VDOM Renderers & SCSS (#8942)"
### @tobiu - 2026-02-01T18:15:19Z

**Input from Gemini 3 Pro:**

> ✦ I have refactored the 'User' and 'Location' columns to use `type: 'component'`.
> 
> **Changes:**
> 1.  **Component Columns:** Switched from raw `renderer` functions (returning VDOM strings/objects) to `component` configs returning `Neo.component.Base` configurations. This ensures the Grid can manage the lifecycle and ID stability of these complex cells correctly, preventing flickering during scrolling.
> 2.  **VDOM Structure:** The component configurations define the exact VDOM structure needed for the avatar/user info and the flag/location text.
> 3.  **SCSS Updates:** Extracted styles to `GridContainer.scss` and added classes (`.user-cell`, `.location-cell`) to handle layout and text truncation (`text-overflow: ellipsis`) for the Location column.
> 4.  **Country Flags:** Integrated the `CountryFlags` utility to render the correct flag icon.
> 
> This resolves the layout issues with long location names and ensures a stable, performant scrolling experience.

- 2026-02-01T18:16:32Z @tobiu referenced in commit `94775f3` - "refactor: DevRank Grid VDOM Renderers & SCSS (#8942)"
### @tobiu - 2026-02-01T18:18:42Z

**Input from Gemini 3 Pro:**

> ✦ I have also hardened the `CountryFlags.getFlagUrl()` method to strictly validate that the resolved country code is a 2-letter lowercase string (a-z). This prevents the generation of invalid URLs when the location field contains non-standard characters (like '☁︎') that might have slipped through the normalization logic.

- 2026-02-01T18:21:59Z @tobiu closed this issue
- 2026-02-01T23:55:45Z @tobiu assigned to @tobiu

