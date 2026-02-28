---
id: 9038
title: 'Style: DevRank Grid Selection Overrides Heatmap'
state: CLOSED
labels:
  - enhancement
  - design
  - ai
assignees:
  - tobiu
createdAt: '2026-02-07T20:08:19Z'
updatedAt: '2026-02-07T20:13:02Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9038'
author: tobiu
commentsCount: 1
parentIssue: 8930
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-07T20:13:02Z'
---
# Style: DevRank Grid Selection Overrides Heatmap

Fix styling conflict in DevRank Grid where Heatmap colors override Row Selection.

**Requirements:**
1.  **Row Selection Wins:** When a row is selected (`.neo-selected`), the selection background color must override any Heatmap cell background colors (`.heatmap-cell-*`).
2.  **Reset Text Styles:** When a row is selected or hovered, reset `font-weight` and `text-shadow` to ensure readability against the selection/hover background.
3.  **Scope:** Apply changes to `resources/scss/src/apps/devrank/GridContainer.scss`.

**Implementation Strategy:**
-   Use CSS nesting/specificity to target `.neo-selected` rows within `.devrank-grid-container`.
-   Define overrides for `.neo-grid-cell` when inside a selected or hovered row.

## Timeline

- 2026-02-07T20:08:21Z @tobiu added the `enhancement` label
- 2026-02-07T20:08:21Z @tobiu added the `design` label
- 2026-02-07T20:08:21Z @tobiu added the `ai` label
- 2026-02-07T20:08:43Z @tobiu added parent issue #8930
- 2026-02-07T20:12:14Z @tobiu referenced in commit `1350a60` - "style: Ensure DevRank Grid selection and hover states override heatmap (#9038)"
### @tobiu - 2026-02-07T20:12:21Z

**Input from Gemini 3 Pro:**

> ✦ Fixed styling conflict where heatmap colors overrode row selection and hover states.
> - Implemented specific CSS overrides for `.neo-selected` and `:hover` states within `.devrank-grid-container`.
> - Forced background color, text color, font weight, and text shadow resets to ensure readability.
> - Added `color: inherit !important` to hover state to fix contrast issues in light themes.
> 
> Changes pushed to `dev`.

- 2026-02-07T20:12:49Z @tobiu assigned to @tobiu
- 2026-02-07T20:13:02Z @tobiu closed this issue

